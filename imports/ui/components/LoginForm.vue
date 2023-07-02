<template>
    <Alert ref="alertsComponent" :message="alertMessage" :type="alertType" />

    <div class="flex items-center justify-center h-screen">
        <div
            class="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700"
        >
            <form class="space-y-6" action="#" @submit.prevent="handleSubmit">
                <div class="mb-6 align-middle">
                    <img
                        src="https://www.keela.co/wp-content/uploads/logo.png"
                        class="h-8 m-auto"
                        alt="Keela Logo"
                    />
                </div>
                <div>
                    <label
                        for="username"
                        class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >Your username</label
                    >
                    <input
                        type="username"
                        name="username"
                        id="username"
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        placeholder="keela"
                        required
                        v-model="username"
                    />
                </div>
                <div>
                    <label
                        for="password"
                        class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >Your password</label
                    >
                    <input
                        type="password"
                        name="password"
                        id="password"
                        placeholder="••••••••"
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        required
                        v-model="password"
                    />
                </div>
                <button
                    type="submit"
                    class="w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                >
                    Login
                </button>
            </form>
        </div>
    </div>
</template>

<script>
import { Meteor } from 'meteor/meteor';
import Alert from './Alerts.vue';

export default {
    components: {
        Alert,
    },
    name: 'LoginForm',
    data() {
        return {
            username: '',
            password: '',
            alertType: '',
            alertMessage: '',
        };
    },
    methods: {
        showAlerts(type, message) {
            this.alertType = type;
            this.alertMessage = message;
            this.$refs.alertsComponent.showAlertMessage();
        },
        handleSubmit() {
            Meteor.loginWithPassword(this.username, this.password, (error) => {
                if (error) {
                    this.showAlerts(
                        'error',
                        'Error! Check you username and password'
                    );
                    console.log(error);
                } else {
                    this.$router.push({ name: 'Home' });
                    this.showAlerts('success', 'Logged in Successfully');
                }
            });
        },
    },
};
</script>
