<template>
  <div>
    <router-view />
  </div>
</template>

<script>
import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

import { onMounted } from "vue";
import { initFlowbite } from "flowbite";

// initialize components based on data attribute selectors

export default {
  setup() {
    onMounted(() => {
      initFlowbite();
    });
  },
  meteor: {},
  data() {
    return {
      user: null,
    };
  },
  created() {
    Tracker.autorun(() => {
      this.user = Meteor.user();
      console.log(this.user);
    });
  },
  methods: {},
};
</script>
