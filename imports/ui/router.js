import { createRouter, createWebHistory } from 'vue-router';
import Home from './components/Home.vue';
import LoginForm from './components/LoginForm.vue';
import NotFound from './components/NotFound.vue';
import Organizations from './components/organization/Organizations.vue';
import Contacts from './components/contact/Contacts.vue';
import Dashboard from './components/Dashboard.vue';
import Users from './components/users/Users.vue';
import Tags from './components/tags/Tags.vue';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Home',
            component: Home,
            meta: { requiresAuth: true },
            redirect: '/',
            children: [
                {
                    path: '/',
                    name: 'Dashboard',
                    component: Dashboard,
                },
                {
                    path: '/organizations',
                    name: 'Organization',
                    component: Organizations,
                },
                {
                    path: '/users',
                    name: 'Users',
                    component: Users,
                },
                {
                    path: '/tags',
                    name: 'Tags',
                    component: Tags,
                },
                {
                    path: '/contacts',
                    name: 'Contacts',
                    component: Contacts,
                },
            ],
        },
        {
            path: '/login',
            name: 'LoginForm',
            component: LoginForm,
            meta: { requiresAuth: false },
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: NotFound,
        },
    ],
});

router.beforeEach((to, from, next) => {
    if (to.meta.requiresAuth && !Meteor.userId()) {
        next('/login');
    } else if (to.meta.requiresAuth === false && Meteor.userId()) {
        next('/');
    } else {
        next();
    }
});
