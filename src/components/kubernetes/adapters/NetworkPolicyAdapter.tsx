import type { ResourceAdapter } from './types';
import type { NetworkPolicyResource } from '../networkPolicy';
import { NetworkPolicyView } from '../NetworkPolicyView';

export const NetworkPolicyAdapter: ResourceAdapter<NetworkPolicyResource> = {
  kinds: ['NetworkPolicy', 'NetworkPolicies'],
  adapt(context, policy) {
    return {
      sections: [
        {
          id: 'traffic',
          data: {
            type: 'custom',
            render: () => <NetworkPolicyView context={context} policy={policy} />,
          },
        },
      ],
    };
  },
};
