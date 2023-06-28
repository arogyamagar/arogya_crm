import { Accounts } from 'meteor/accounts-base'
import { Meteor } from 'meteor/meteor'
Meteor.methods({
    'users.insert'(accountDetails) {
        if (!Accounts.findUserByUsername(accountDetails.username)) {
            Accounts.createUser(accountDetails)
        }
    },
    'users.getUserById'(userId) {
        return Meteor.users.findOne({ _id: userId })
    },
    'users.remove'(userId) {
        // preventing removal of users with role of keelaAdmin
        Meteor.users.remove({
            _id: userId,
            'profile.role': { $ne: 'keelaAdmin' },
        })
    },
    'users.update'(
        userId,
        { username, password, profile } = newAccountDetails
    ) {
        if (password !== '') {
            Accounts.setPassword(userId, password)
        }
        Meteor.users.update({ _id: userId }, { $set: { username, profile } })
    },
    'users.addTags'(tagName, username) {
        Meteor.users.update(
            { username },
            { $push: { 'profile.tags': tagName } }
        )
    },
})
