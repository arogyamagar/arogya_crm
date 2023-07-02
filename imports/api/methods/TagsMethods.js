import { TagsCollection } from '../collection/TagsCollection';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { permission } from '../decleration/permission';
import { checkUserRole } from '../checks/checkUserRoles';

Meteor.methods({
    'tags.create'(tagsDetails) {
        const currentUser = Meteor.user();
        check(tagsDetails, Object);
        if (!tagsDetails) {
            throw new Meteor.Error('No tags found.');
        }
        if (checkUserRole(permission.CREATE_TAG)) {
            if (currentUser)
                TagsCollection.insert({
                    ...tagsDetails,
                    createdAt: new Date(),
                    userId: this.userId,
                    organizationId: currentUser.profile.organizationId,
                });
        } else {
            throw new Meteor.Error('Operation Not authorized.');
        }
    },

    'tags.remove'(tagId) {
        check(tagId, String);
        const tag = TagsCollection.findOne({
            _id: tagId,
        });
        if (!tag) {
            Meteor.Error("Organization doesn't exist");
        }
        if (checkUserRole(permission.REMOVE_TAG)) {
            TagsCollection.remove(tagId);
        } else {
            return Meteor.Error('Operation Not Authorized');
        }
    },
    'tags.edit'(tag) {
        const { _id, name } = tag;
        if (checkUserRole(permission.EDIT_TAG)) {
            TagsCollection.update(_id, {
                $set: {
                    name: name,
                    modifiedBy: this.userId,
                    modifiedAt: new Date(),
                },
            });
        } else {
            throw new Meteor.Error('Operation Not authorized.');
        }
    },
});
