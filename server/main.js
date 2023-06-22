import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'

// Collections
import { OrganizationsCollection } from '../imports/api/collection/OrganizationsCollection'
import { TagsCollection } from '../imports/api/collection/TagsCollection'

// Methods
import '../imports/api/methods/TagsMethods'
import '../imports/api/methods/OrganizationMethods'

// Publications
import '../imports/api/publications/OrganizationPublication'
import '../imports/api/publications/TagsPublications'

const KEELA_ADMIN_USERNAME = 'keelaAdmin'
const ADMIN_USERNAME = 'admin'
const COORDINATOR_USERNAME = 'cordinator'
const PASSWORD = 'password'

Meteor.startup(async () => {
    if (!Accounts.findUserByUsername(KEELA_ADMIN_USERNAME)) {
        Accounts.createUser({
            username: KEELA_ADMIN_USERNAME,
            password: PASSWORD,
            profile: {
                role: 'keelaAdmin',
            },
        })
    }

    if (!Accounts.findUserByUsername(ADMIN_USERNAME)) {
        Accounts.createUser({
            username: ADMIN_USERNAME,
            password: PASSWORD,
            profile: {
                role: 'admin',
            },
        })
    }

    if (!Accounts.findUserByUsername(COORDINATOR_USERNAME)) {
        Accounts.createUser({
            username: COORDINATOR_USERNAME,
            password: PASSWORD,
            profile: {
                role: 'coordinator',
            },
        })
    }
})
