import { Meteor } from 'meteor/meteor';

Meteor.publish('users', function publishUser() {
    return Meteor.users.find({});
});
