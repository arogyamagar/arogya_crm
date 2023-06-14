<template>
  <div class="flex items-center justify-center h-screen bg-slate-100">
    <form class="w-1/3 bg-white p-16" @submit.prevent="handleSubmit">
      <div class="mb-6 align-middle">
        <img
          src="https://www.keela.co/wp-content/uploads/logo.png"
          class="h-8 m-auto"
          alt="Keela Logo"
        />
      </div>
      <div class="mb-6">
        <label
          for="username"
          class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
          >Username</label
        >
        <input
          type="username"
          id="username"
          class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          placeholder="keela"
          required
          v-model="username"
        />
      </div>
      <div class="mb-6">
        <label
          for="password"
          class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
          >Your password</label
        >
        <input
          type="password"
          id="password"
          class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          placeholder="password"
          required
          v-model="password"
        />
      </div>
      <button
        type="submit"
        class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
      >
        Login
      </button>
    </form>
  </div>
</template>

<script>
import { Meteor } from "meteor/meteor";
console.log("Hello");
export default {
  name: "LoginForm",
  data() {
    return {
      username: "",
      password: "",
    };
  },
  methods: {
    handleSubmit() {
      Meteor.loginWithPassword(this.username, this.password, (error) => {
        if (error) {
          console.log(error);
        } else {
          this.$router.push({ name: "Home" });
        }
      });
    },
  },
};
</script>
