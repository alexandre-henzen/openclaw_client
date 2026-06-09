import { baseApi } from '../../shared/api/baseApi';

export type PairingStatus = 'paired' | 'pairing_pending' | 'unauthorized' | 'error';

export const copilotApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSessionToken: build.query<
      { appSessionToken: string; threadId: string; conversationId: number },
      number
    >({
      query: (conversationId) => `/conversation/${conversationId}/session-token`,
    }),
    pairingCheck: build.mutation<{ status: PairingStatus }, void>({
      query: () => ({
        url: '/openclaw/pairing/check',
        method: 'POST',
        body: {},
      }),
    }),
    pairingStart: build.mutation<
      { status: string; pairingCode?: string; instructions?: string },
      void
    >({
      query: () => ({
        url: '/openclaw/pairing/start',
        method: 'POST',
        body: {},
      }),
    }),
    pairingApprove: build.mutation<{ status: string }, { pairingCode: string }>({
      query: (body) => ({
        url: '/openclaw/pairing/approve',
        method: 'POST',
        body,
      }),
    }),
    listArtifacts: build.query<
      {
        items: Array<{
          id: number;
          artifactId: string;
          protocol: string;
          title?: string;
          mimeType?: string;
          runId?: string;
          downloadAvailable?: boolean;
          sizeBytes?: number;
        }>;
      },
      { conversationId: number; appSessionToken: string }
    >({
      query: ({ conversationId, appSessionToken }) => ({
        url: `/conversation/${conversationId}/artifacts`,
        headers: { 'X-App-Session-Id': appSessionToken },
      }),
    }),
  }),
});

export const {
  useGetSessionTokenQuery,
  usePairingCheckMutation,
  usePairingStartMutation,
  usePairingApproveMutation,
  useListArtifactsQuery,
} = copilotApi;
