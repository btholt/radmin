const scanner = require('./scanner')
const logger = require('./logger')
const Botkit = require('botkit')
const co = require('co')
const _ = require('lodash')
const fs = require('fs')
const configBuffer = fs.readFileSync('./config.json')
const config = JSON.parse(configBuffer)
const token = config.private[process.env.NODE_ENV].slackKey

if (!token) {
  logger.error('No Slack token')
  process.exit(1);
}

const controller = Botkit.slackbot({
  debug: false
})

const botAPI = controller.spawn({
  token,
  retry: 'Infinity'
}).startRTM((err) => {
  if (err) {
    logger.error('Slack Error', err)
    throw new Error(err)
  }
})

controller.hears(['fullScan'], ['direct_mention'], (bot, msg) => {
  const replyCB = bot.reply.bind(this, msg)
  if (config.superusers.indexOf(msg.user) < 0) {
    return logger.info("You don't have permission to do this. Sorry. This command hammers the reddit API.", replyCB)
  }
  scanner.fullScan(logger, bot.reply.bind(this, msg))
})

controller.hears(['scan'], ['direct_mention'], (bot, msg) => {
  const parts = msg.text.split(' ')
  const replyCB = bot.reply.bind(this, msg)
  if (parts.length !== 2 || parts[0] !== 'scan') {
    return logger.info('This is an invalid format. Try saying `scan <username>`', replyCB)
  }
  scanner.scan(parts[1].toLowerCase(), logger, bot.reply.bind(this, msg))
})

controller.hears(['list'], ['direct_mention'], (bot, msg) => {
  const parts = msg.text.split(' ')
  if (parts[0] !== 'list') return

  scanner.list(logger, bot.reply.bind(this, msg))
})
