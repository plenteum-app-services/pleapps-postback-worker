# Ple App Services: Postback Worker

This repository contains the worker that processes the postback requests as a result of various actions performed by the Plenteum App Services platform.

## Prerequisites

* [RabbitMQ](https://www.rabbitmq.com/)
* [Node.js](https://nodejs.org/) LTS

## Foreword

We know that this documentation needs cleaned up and made easier to read. We'll compile it as part of the full documentation as the project moves forward.

## Setup

1) Clone this repository to wherever you'd like the API to run:

```bash
git clone https://github.com/plenteum-app-services/pleapps-postback-worker
```

2) Install the required Node.js modules

```bash
cd pleapps-postback-worker && npm install
```

3) Use your favorite text editor to change the values as necessary in `config.json`

```javascript
{
  "queues": {
    "complete": "complete.wallet"
  },
  "postTimeout": 5000
}
```

4) Fire up the script

```bash
export RABBIT_PUBLIC_SERVER=localhost
export RABBIT_PUBLIC_USERNAME=yourrabbitmqusername
export RABBIT_PUBLIC_PASSWORD=yourrabbitmqpassword
node index.js
```

5) Optionally, install PM2 or another process manager to keep the service running.

```bash
npm install -g pm2@latest
pm2 startup
pm2 start index.js --name pleapps-postback-worker -i max
pm2 save
```

###### (c) 2018-2019 TurtlePay™ Development Team
###### (c) 2018-2019 Plenteum Development Team
