import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { permission } from '../decleration/permission';
import { checkUserRole } from '../checks/checkUserRoles';

Meteor.methods({
    'users.create'(userDetails) {
        if (checkUserRole(permission.CREATE_USER)) {
            if (!Accounts.findUserByUsername(userDetails.username)) {
                Accounts.createUser(userDetails);
            }
        } else {
            throw new Meteor.Error('Operation Not authorized.');
        }
        if (!Accounts.findUserByUsername(userDetails.username)) {
            Accounts.createUser(userDetails);
        }
    },
    'users.remove'(userId) {
        check(userId, String);
        if (checkUserRole(permission.REMOVE_USER)) {
            if (!this.userId) {
                throw new Meteor.Error('Operation not authorized.');
            }
            if (this.userId === userId) {
                throw new Meteor.Error('Cannot delete myself');
            }
            Meteor.users.remove(userId);
        } else {
            throw new Meteor.Error('Operation not authorized.');
        }
        Meteor.users.remove({
            _id: userId,
            'profile.role': { $ne: 'keelaAdmin' },
        });
    },
    'users.update'(user) {
        if (checkUserRole(permission.EDIT_USER)) {
            Meteor.users.update(
                { _id: user.userId },
                {
                    $set: {
                        username: user.updates.username,
                        'profile.role': user.updates['profile.role'],
                    },
                }
            );
        } else {
            throw new Meteor.Error('Operation not authorized.');
        }
    },
});
