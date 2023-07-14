import { roles } from './roles';
export const permission = {
    CREATE_ORGANIZATION: [roles.keelaAdmin],
    REMOVE_ORGANIZATION: [roles.keelaAdmin],
    EDIT_ORGANIZATION: [roles.keelaAdmin],
    VIEW_ORGANIZATION: [roles.keelaAdmin],

    CREATE_USER: [roles.keelaAdmin, roles.admin],
    REMOVE_USER: [roles.keelaAdmin, roles.admin],
    EDIT_USER: [roles.keelaAdmin, roles.admin],
    VIEW_USER: [roles.keelaAdmin, roles.admin],

    CREATE_TAG: [roles.admin, roles.coordinator],
    REMOVE_TAG: [roles.admin, roles.coordinator],
    EDIT_TAG: [roles.admin, roles.coordinator],
    VIEW_TAG: [roles.admin, roles.coordinator],

    CREATE_CONTACT: [roles.admin],
    REMOVE_CONTACT: [roles.admin],
    EDIT_CONTACT: [roles.admin],
    VIEW_CONTACT: [roles.admin, roles.coordinator],
};
