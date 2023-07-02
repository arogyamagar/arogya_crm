<template>
    <div
        id="alert-warning"
        v-if="showAlert"
        :class="[
            alertType,
            'fixed flex items-center w-full max-w-xs text-gray-500 bg-white p-4 mb-4 rounded-lg shadow top-5 right-5 dark:text-gray-400 dark:bg-gray-800 z-[9999]',
        ]"
        role="alert"
    >
        <svg
            aria-hidden="true"
            class="flex-shrink-0 w-5 h-5"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
            ></path>
        </svg>
        <span class="sr-only">Success</span>
        <div class="ml-3 text-sm font-medium">{{ message }}</div>
        <button
            @click="hideAlert"
            type="button"
            :class="[
                closeType,
                'ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 hover:bg-blue-200 inline-flex h-8 w-8 dark:bg-gray-800 dark:hover:bg-gray-700',
            ]"
            data-dismiss-target="#alert-1"
            aria-label="Close"
        >
            <span class="sr-only">Close</span>
            <svg
                aria-hidden="true"
                class="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                ></path>
            </svg>
        </button>
    </div>
</template>

<script>
export default {
    name: 'Alerts',
    props: {
        message: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            default: 'info',
        },
    },
    computed: {
        alertType() {
            switch (this.type) {
                case 'success':
                    return 'text-green-800 dark:text-green-400 bg-green-50';
                case 'warning':
                    return 'text-yellow-800 dark:text-yellow-400 bg-yellow-50';
                case 'error':
                    return 'text-red-800 dark:text-red-400 bg-red-50';
                default:
                    return 'text-blue-800 dark:text-blue-400 bg-blue-50';
            }
        },
        closeType() {
            switch (this.type) {
                case 'success':
                    return 'bg-green-50 text-green-500 focus:ring-green-400 dark:text-green-400';
                case 'warning':
                    return 'bg-yellow-50 text-yellow-500 focus:ring-yellow-400 dark:text-yellow-400';
                case 'error':
                    return 'bg-red-50 text-red-500 focus:ring-red-400 dark:text-red-400';
                default:
                    return 'bg-blue-50 text-blue-500 focus:ring-blue-400 dark:text-blue-400';
            }
        },
    },

    data() {
        return {
            showAlert: false,
        };
    },

    methods: {
        showAlertMessage() {
            this.showAlert = true;
            setTimeout(() => {
                this.hideAlert();
            }, 5000);
        },
        hideAlert() {
            this.showAlert = false;
        },
    },
};
</script>

<style lang="scss" scoped></style>
