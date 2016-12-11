const scanner = require('./scanner')
const discover = require('./discover')
const logger = require('./logger')
const Botkit = require('botkit')
const co = require('co')
const _ = require('lodash')
const fs = require('fs')
const configBuffer = fs.readFileSync('./config.json')
const config = JSON.parse(configBuffer)
const token = config.private[process.env.NODE_ENV].slackKey
const newUserRegex = () => /(?:reddit.com\/u(ser)?\/)([\w\d_-]{3,20})/ig

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

controller.hears([newUserRegex()], ['ambient'], (bot, msg) => {
  let execMatches
  const matcher = newUserRegex()
  let matches = []
  while ((execMatches = matcher.exec(msg.text)) !== null) {
    matches.push(execMatches[2])
  }
  matches = _.uniq(matches)
  const replyCB = bot.reply.bind(this, msg)
  matches.forEach((match) => scanner.scan(match.toLowerCase(), logger, bot.reply.bind(this, msg)))
})

controller.hears(['list'], ['direct_mention'], (bot, msg) => {
  const parts = msg.text.split(' ')
  if (parts[0] !== 'list') return

  scanner.list(logger, bot.reply.bind(this, msg))
})

controller.hears(['subreddit'], ['direct_mention'], (bot, msg) => {
  const parts = msg.text.split(' ')
  const replyCB = bot.reply.bind(this, msg)
  if (parts.length !== 2 || parts[0] !== 'subreddit') {
    return logger.info('This is an invalid format. Try saying `subreddit <subreddit>`', replyCB)
  }
  discover.scanSubreddit(parts[1], config.maxTopics, logger, replyCB)
})

controller.hears(['topic'], ['direct_mention'], (bot, msg) => {
  const parts = msg.text.split(' ')
  const replyCB = bot.reply.bind(this, msg)
  if (parts.length !== 2 || parts[0] !== 'topic') {
    return logger.info('This is an invalid format. Try saying `topic <topic id>`. (in https://www.reddit.com/r/blog/comments/2foivo/every_man_is_responsible_for_his_own_soul/ the topic ID is 2foivo)`', replyCB)
  }

  discover.scanTopic(parts[1], logger, replyCB)
})
