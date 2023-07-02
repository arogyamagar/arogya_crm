import { Meteor } from 'meteor/meteor';

function checkUserRole(allowedRoles, user) {
    const currentUser = user ? user : Meteor.user();
    if (!currentUser) {
        throw new Meteor.Error('User not found');
    }
    if (!allowedRoles.includes(currentUser.profile.role)) {
        return false;
    }
    return true;
}

export { checkUserRole };
