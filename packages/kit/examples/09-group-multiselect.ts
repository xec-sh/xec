/**
 * 09 - Group Multi-Select
 *
 * Hierarchical multi-select with group headers.
 * Groups can optionally be selectable to toggle all items at once.
 */
import {
  intro, groupMultiselect, isCancel, cancel, log, outro,
} from '../src/index.js';

async function main() {
  intro('Group Multi-Select Examples');

  // Basic grouped selection
  const permissions = await groupMultiselect({
    message: 'Configure role permissions',
    options: {
      'Users': [
        { value: 'users:read', label: 'View users' },
        { value: 'users:write', label: 'Create/edit users' },
        { value: 'users:delete', label: 'Delete users' },
      ],
      'Projects': [
        { value: 'projects:read', label: 'View projects' },
        { value: 'projects:write', label: 'Create/edit projects' },
        { value: 'projects:admin', label: 'Manage project settings' },
      ],
      'Billing': [
        { value: 'billing:read', label: 'View invoices' },
        { value: 'billing:write', label: 'Manage payment methods' },
      ],
    },
  });
  if (isCancel(permissions)) { cancel('Cancelled.'); process.exit(0); }

  // Non-selectable groups (only individual items can be selected)
  // with spacing between groups
  const features = await groupMultiselect({
    message: 'Select features to enable',
    selectableGroups: false,
    groupSpacing: 1,
    required: false,
    options: {
      'Frontend': [
        { value: 'ssr', label: 'Server-side rendering' },
        { value: 'pwa', label: 'Progressive Web App' },
      ],
      'Backend': [
        { value: 'rest', label: 'REST API' },
        { value: 'graphql', label: 'GraphQL API' },
      ],
      'DevOps': [
        { value: 'docker', label: 'Docker' },
        { value: 'k8s', label: 'Kubernetes' },
      ],
    },
  });
  if (isCancel(features)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Permissions: ${(permissions as string[]).join(', ')}`);
  log.success(`Features: ${(features as string[]).length > 0 ? (features as string[]).join(', ') : 'none'}`);
  outro('Done!');
}

main().catch(console.error);
