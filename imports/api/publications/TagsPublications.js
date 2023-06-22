import { Meteor } from 'meteor/meteor'
import { TagsCollection } from '../collection/TagsCollection'

Meteor.publish('tags', function publishTags() {
    return TagsCollection.find({ userId: this.userId })
})
