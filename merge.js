const fs = require('fs')
const formerBuffer = fs.readFileSync('./former.json')
const former = JSON.parse(formerBuffer)
const DATA_PATH = './data.json'
const dbBuffer = fs.readFileSync(DATA_PATH)
const db = JSON.parse(dbBuffer)
const _ = require('lodash')

const format = (former) => {
  const user = _.pick(former, ['name', 'username', 'role'])
  user.verified = true
  user.verifiedReason = 'old reddit about json'
  user.email = ''
  user.slack = ''
  return user
}

const userCompare = (a,b) =>  a.username.toLowerCase() === b.username.toLowerCase()


const alumni = _.differenceWith(former.alumni, db.current, userCompare)
const rejoined = _.intersectionWith(former.alumni, db.current, userCompare)
const team = former.team.concat(rejoined)

const current = db.current
  .map((user) => {
  let oldUser = _.find(team, (needle) => user.username.toLowerCase() === needle.username.toLowerCase())
  if (!oldUser) {
    oldUser = {name: '', username: user.username, role: ''}
  }
  oldUser = format(oldUser)
  oldUser.verifiedReason = 'radmin scan'
  return oldUser
})

const newEx = _.differenceWith(team, db.current, userCompare)
  .concat(alumni)
  .map(format)

fs.writeFileSync(DATA_PATH, JSON.stringify({
  current,
  uninvited: newEx
}, null, 4))

