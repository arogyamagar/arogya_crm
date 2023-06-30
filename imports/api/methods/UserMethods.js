import { Accounts } from 'meteor/accounts-base'
import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { permission } from '../decleration/permission'
import { checkUserRole } from '../checks/checkUserRoles'

Meteor.methods({
    'users.create'(userDetails) {
        if (checkUserRole(permission.CREATE_USER)) {
            if (!Accounts.findUserByUsername(userDetails.username)) {
                Accounts.createUser(userDetails)
            }
        } else {
            throw new Meteor.Error('Operation Not authorized.')
        }
        if (!Accounts.findUserByUsername(userDetails.username)) {
            Accounts.createUser(userDetails)
        }
    },
    'users.remove'(userId) {
        check(userId, String)
        if (checkUserRole(permission.REMOVE_USER)) {
            if (!this.userId) {
                throw new Meteor.Error('Operation not authorized.')
            }
            if (this.userId === userId) {
                throw new Meteor.Error('Cannot delete myself')
            }
            Meteor.users.remove(userId)
        } else {
            throw new Meteor.Error('Operation not authorized.')
        }
        // preventing removal of users with role of keelaAdmin
        Meteor.users.remove({
            _id: userId,
            'profile.role': { $ne: 'keelaAdmin' },
        })
    },
    'users.edit'(user) {
        const { _id, username, selectedRole } = user
        if (checkUserRole(permission.EDIT_USER)) {
            Meteor.users.update(_id, {
                $set: {
                    username: username,
                    'profile.role': selectedRole,
                    'profile.organization': profile.organization,
                },
            })
            return 'User updated successfully.'
        } else {
            throw new Meteor.Error('Not authorized.')
        }
    },
})
