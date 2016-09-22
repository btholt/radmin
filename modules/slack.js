const co = require('co')
const promisify = require('es6-promisify')

const getUser = (bot, id) => (
  co(function * () {
    bot.api.users.list({
      token
    }, function(err,data) {
      console.log(err, data)
    })
  })
)

module.exports = {
  getUser
}
