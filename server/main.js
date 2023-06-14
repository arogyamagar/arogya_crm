import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";

const SEED_USERNAME = "keela";
const SEED_PASSWORD = "password";

Meteor.startup(async () => {
  if (!Accounts.findUserByUsername(SEED_USERNAME)) {
    Accounts.createUser({
      username: SEED_USERNAME,
      password: SEED_PASSWORD,
    });
  }
});
