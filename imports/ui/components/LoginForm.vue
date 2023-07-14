<template>
    <Alert ref="alertsComponent" :message="alertMessage" :type="alertType" />

    <div class="flex justify-end mt-3 mr-5">
        <!-- Modal toggle -->
        <button
            @click="toggleModal"
            class="block font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:focus:ring-indigo-800"
            type="button"
        >
            <div class="flex items-center gap-2">
                <p>Info</p>
                <svg
                    class="w-4 h-4 text-indigo-700 hover:text-indigo-800 dark:text-white"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 8"
                >
                    <path
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="m1 1 5.326 5.7a.909.909 0 0 0 1.348 0L13 1"
                    />
                </svg>
            </div>
        </button>

        <!-- Main modal -->
        <div
            v-if="showModal"
            id="defaultModal"
            tabindex="-1"
            aria-hidden="true"
            class="fixed flex items-center justify-center"
        >
            <div class="relative w-full max-w-2xl max-h-full">
                <!-- Modal content -->
                <div
                    class="relative bg-white rounded-lg shadow dark:bg-gray-700"
                >
                    <!-- Modal header -->
                    <div
                        class="flex items-start justify-between p-4 border-b rounded-t dark:border-gray-600"
                    >
                        <h3
                            class="text-xl font-semibold text-gray-900 dark:text-white"
                        >
                            Login Details
                        </h3>
                        <button
                            @click="hideModal"
                            type="button"
                            class="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ml-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white"
                            data-modal-hide="defaultModal"
                        >
                            <svg
                                class="w-3 h-3"
                                aria-hidden="true"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 14 14"
                            >
                                <path
                                    stroke="currentColor"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                                />
                            </svg>
                            <span class="sr-only">Close modal</span>
                        </button>
                    </div>
                    <!-- Modal body -->
                    <div class="p-6 space-y-6">
                        <span
                            class="text-base leading-relaxed text-gray-500 dark:text-gray-400"
                        >
                            Usernames to Login:
                            <ul>
                                <li>- keelaAdmin</li>
                                <li>- admin</li>
                                <li>- coordinator</li>
                            </ul>
                            <br />
                            Password to login:
                            <ul>
                                <li>- password</li>
                            </ul>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="flex items-center justify-center mt-14">
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
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
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
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        required
                        v-model="password"
                    />
                </div>
                <button
                    type="submit"
                    class="w-full text-white bg-indigo-700 hover:bg-indigo-800 focus:ring-4 focus:outline-none focus:ring-indigo-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:focus:ring-indigo-800"
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
            showModal: false,
        };
    },
    methods: {
        toggleModal() {
            this.showModal = !this.showModal;
        },
        hideModal() {
            this.showModal = false;
        },
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
