import { roles } from './roles'
export const permission = {
    CREATE_ORGANIZATION: [roles.keelaAdmin],
    REMOVE_ORGANIZATION: [roles.keelaAdmin],
    EDIT_ORGANIZATION: [roles.keelaAdmin],
    VIEW_ORGANIZATION: [roles.keelaAdmin],

    CREATE_USER: [roles.admin, roles.keelaAdmin],
    REMOVE_USER: [roles.admin, roles.keelaAdmin],
    EDIT_USER: [roles.keelaAdmin, roles.admin],
    VIEW_USER: [roles.admin, roles.keelaAdmin],

    CREATE_TAG: [roles.keelaAdmin, roles.admin, roles.coordinator],
    REMOVE_TAG: [roles.keelaAdmin, roles.admin, roles.coordinator],
    EDIT_TAG: [roles.keelaAdmin, roles.admin, roles.coordinator],
    VIEW_TAG: [roles.admin, roles.coordinator],

    CREATE_CONTACT: [roles.keelaAdmin, roles.admin],
    REMOVE_CONTACT: [roles.keelaAdmin, roles.admin],
    EDIT_CONTACT: [roles.keelaAdmin, roles.admin],
    VIEW_CONTACT: [roles.keelaAdmin, roles.admin, roles.coordinator],
}
