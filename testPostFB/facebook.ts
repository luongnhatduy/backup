import { FacebookGraph } from './facebookGraph';

export interface FacebookTokenInspecting {
  'data'?: {
    'app_id': string,
    'type': FacebookTokenType,
    'application': string,
    'data_access_expires_at': number,
    'expires_at': number,
    'is_valid': boolean,
    'scopes': string[],
    'user_id': string,
    'profile_id'?: string
  }

  [key: string]: any
}

export enum FacebookTokenType {
  PAGE = 'PAGE',
  USER = 'USER'
}

export const FACEBOOK_APP_ID = '791337224965423';
export const FACEBOOK_APP_SECRET = '8d7a36e5780f3a9307a369543e70120c';
export const GRAPH_API_WEBHOOKS_VERIFY_TOKEN = 'GraphAPIWebhooksVerifyTokenQL6625';

export class Facebook extends FacebookGraph {

  constructor(accessToken: string, version: string = '3.3') {
    super(accessToken, version);
  }

  updateAccessToken = async (accessToken: string) => {
    this.accessToken = accessToken;
  };

  getRecentPostIds = async (pageId: string, size: number = 10) => {
    const requestPath = `${pageId}/posts`;
    return await this.paginate(requestPath, { limit: 25, fields: this.fieldsBuilder(['id', 'created_time']) }, size);
  };

  getPostContentById = async (postId: string) => {
    const path = `${postId}`;
    const params = {
      fields: this.fieldsBuilder(['id', 'message', { 'attachments': ['media_type', 'url', 'media', 'subattachments'] }])
    };
    return this.get(path, params);
  };

  getPostContentByIds = async (postIds: string[]) => {
    const batch: {}[] = [];
    postIds.forEach(postId => {
      batch.push({
        method: 'GET',
        relative_url: postId
      });
    });
    return this.batch(batch);
  };

  // Generate App Access Token
  // https://developers.facebook.com/docs/facebook-login/access-tokens/#apptokens
  generateAppToken = async () => {
    const params = {
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      grant_type: 'client_credentials',
      access_token: undefined         // Don't need access_token in this request, override current this.access_token
    };
    const response = await this.get('oauth/access_token', params);
    return response.access_token;
  };

  // Generate long-live user access_token
  // https://developers.facebook.com/docs/facebook-login/access-tokens/refreshing/#generate-long-lived-token
  // https://developers.facebook.com/docs/facebook-login/access-tokens/expiration-and-extension/
  generateLongLiveUserAccessToken = async () => {
    return this.extend(FACEBOOK_APP_ID, FACEBOOK_APP_SECRET);
  };

  getPageAccessToken = async (pageId: string) => {
    const res = await this.get('me', {
      fields: this.fieldsBuilder(['id', 'name', 'accounts'])
    });
    const data = ((res as any).accounts.data as Array<any>).find(value => value.id === pageId);
    const accessToken = data.access_token;
    return accessToken;
  };
}
