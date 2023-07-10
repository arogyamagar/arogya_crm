import { Meteor } from 'meteor/meteor';
import { TagsCollection } from '../collection/TagsCollection';

Meteor.publish('tags', function publishTags() {
    const currentUser = Meteor.user();
    if (
        currentUser &&
        currentUser.profile &&
        currentUser.profile.organizationId
    ) {
        return TagsCollection.find({
            organizationId: currentUser.profile.organizationId,
        });
    }
    return;
});
