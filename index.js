// Copyright (c) 2018, TurtlePay Developers
//
// Please see the included LICENSE file for more information.

'use strict'

const Config = require('./config.json')
const RabbitMQ = require('amqplib')
const cluster = require('cluster')
const util = require('util')
const request = require('request-promise-native')
const MessageSigner = require('./lib/messageSigner.js')
const signer = new MessageSigner()

const cpuCount = require('os').cpus().length

const publicRabbitHost = process.env.RABBIT_PUBLIC_SERVER || 'localhost'
const publicRabbitUsername = process.env.RABBIT_PUBLIC_USERNAME || ''
const publicRabbitPassword = process.env.RABBIT_PUBLIC_PASSWORD || ''

function log (message) {
  console.log(util.format('%s: %s', (new Date()).toUTCString(), message))
}

function spawnNewWorker () {
  cluster.fork()
}

/* Helps us to build the RabbitMQ connection string */
function buildConnectionString (host, username, password) {
  log(util.format('Setting up connection to %s@%s...', username, host))
  var result = ['amqp://']

  if (username.length !== 0 && password.length !== 0) {
    result.push(username + ':')
    result.push(password + '@')
  }

  result.push(host)

  return result.join('')
}

if (cluster.isMaster) {
  console.log('Starting TurtlePay Postback Service...')

  for (var cpuThread = 0; cpuThread < cpuCount; cpuThread++) {
    spawnNewWorker()
  }

  cluster.on('exit', (worker, code, signal) => {
    log(util.format('worker %s died', worker.process.pid))
    spawnNewWorker()
  })
} else if (cluster.isWorker) {
  (async function () {
    try {
      /* Set up our access to the necessary RabbitMQ systems */
      var publicRabbit = await RabbitMQ.connect(buildConnectionString(publicRabbitHost, publicRabbitUsername, publicRabbitPassword))
      var publicChannel = await publicRabbit.createChannel()

      await publicChannel.assertQueue(Config.queues.complete, {
        durable: true
      })

      publicChannel.prefetch(1)

      /* Looks like we received a request */
      publicChannel.consume(Config.queues.complete, async function (message) {
        if (message !== null) {
          /* Parse the incoming message */
          var payload = JSON.parse(message.content.toString())

          if (!payload.request.callback) {
            /* Caller did not provide a callback */
            log(util.format('Worker #%s: Caller did not provide a callback for %s', cluster.worker.id, payload.address))
            return publicChannel.ack(message)
          }

          /* Build what we're going to try to send back */
          const postbackPayload = {
            address: payload.address,
            status: payload.status,
            request: {
              address: payload.request.address,
              amount: payload.request.amount,
              userDefined: payload.request.callerData
            }
          }

          /* If we have a transaction hash add that in */
          if (payload.transactionHash) {
            postbackPayload.txnHash = payload.transactionHash
          }

          /* If we have an amountReceived, add that in */
          if (payload.amountReceived) {
            postbackPayload.amountReceived = payload.amountReceived
          }

          /* If we have an amountSent, add that in */
          if (payload.amountSent) {
            postbackPayload.amountSent = payload.amountSent
          }

          /* If we have a networkFee, add that in */
          if (payload.networkFee) {
            postbackPayload.networkFee = payload.networkFee
          }

          /* If we have an amount, add that in */
          if (payload.amount) {
            postbackPayload.amount = payload.amount
          }

          /* If we have blocksRemaining add that in */
          if (payload.blocksRemaining) {
            postbackPayload.blocksRemaining = payload.blocksRemaining
          }

          /* If we have confirmationsRemaining add that in */
          if (payload.confirmationsRemaining) {
            postbackPayload.confirmationsRemaining = payload.confirmationsRemaining
          }

          /* If we have the keys for the one-time use wallet, add that in */
          if (payload.keys) {
            postbackPayload.keys = payload.keys
          }

          /* If we have a URL that we can post to, then we're going to give it a try */
          if (payload.request.callback.substring(0, 4).toLowerCase() === 'http') {
            signer.sign(postbackPayload, payload.privateKey).then((signature) => {
              postbackPayload.signature = signature
              return request({
                url: payload.request.callback,
                method: 'POST',
                json: true,
                body: postbackPayload,
                timeout: Config.postTimeout
              })
            }).then(() => {
              /* Success, we posted the message to the caller */
              log(util.format('Worker #%s: Successfully delivered [%s] message for %s to %s', cluster.worker.id, payload.status, payload.address, payload.request.callback))
              return publicChannel.ack(message)
            }).catch(() => {
              /* Success, we posted the message to the caller */
              log(util.format('Worker #%s: Failed to deliver [%s] message for %s  to %s', cluster.worker.id, payload.status, payload.address, payload.request.callback))
              return publicChannel.ack(message)
            })
          } else {
            /* They didn't supply a valid callback, we're done here */
            log(util.format('Worker #%s: No valid callback location available for processed payment to %s [%s]', cluster.worker.id, payload.address, payload.status))
            return publicChannel.ack(message)
          }
        }
      })
    } catch (e) {
      log(util.format('Error in worker #%s: %s', cluster.worker.id, e.toString()))
      cluster.worker.kill()
    }

    log(util.format('Worker #%s awaiting requests', cluster.worker.id))
  }())
}
