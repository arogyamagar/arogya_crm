import { Meteor } from "meteor/meteor";
import { OrganizationsCollection } from "../db/OrganizationsCollection";

Meteor.methods({
  insertOrganization(organizations) {
    OrganizationsCollection.insert(organizations);
  },
});
