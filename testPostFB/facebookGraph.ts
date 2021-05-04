// Forked from https://github.com/zaiste/facebookgraph
import { parse } from 'url';
import make, { Method } from 'axios';
import * as moment from 'moment';

type FacebookResponse = {
  data?: Array<{}>,
  next?: { path?: string },
  previous?: { path?: string },
  paging?: { next: string, previous: string },
  access_token?: string
}

type Response = {
  data?: FacebookResponse,
  status?: number,
  statusText?: string,
  headers?: {
    [key:string]: string
  }
};

type MediaResponse = {
  id: string,
  post_id?: string
}

// Scheduling Post limit
// https://developers.facebook.com/docs/graph-api/using-graph-api/common-scenarios/#scheduledposts
const FACEBOOK_SCHEDULE_MIN_DURATION = moment.duration(10, 'minutes');
const FACEBOOK_SCHEDULE_MAX_DURATION = moment.duration(6, 'months');

export class FacebookGraph {
  protected accessToken: string;
  readonly version: string;
  readonly baseURL: string;

  constructor(accessToken: string, version: string = '3.3', debug?: string, baseURL?: string) {
    this.accessToken = accessToken;
    this.version = version;
    this.baseURL = baseURL || 'https://graph.facebook.com';
  }

  async request(path: string, params: any, method: Method = 'GET'): Promise<Response> {
    try {
      const response = await make({
        headers: { 'User-Agent': 'Facebook Graph Client' },
        method: method,
        params: Object.assign({ access_token: this.accessToken }, params),
        url: `${this.baseURL}/v${this.version}/${path}`
      });

      return response;
    } catch (error) {
      console.log(error.response.status);
      console.log(`  ${error.message}`);
      console.log(`  ${error.response.headers['www-authenticate']}`);
      throw error;
    }
  }

  async get(requestPath: string, params: {}): Promise<FacebookResponse> {
    const response = await this.request(requestPath, params);

    if (response) {
      let result: FacebookResponse | undefined = response.data;

      if(!result) {
        return {};
      }

      if (result.paging && result.paging.next) {
        const next = parse(result.paging.next);
        const path = parse(`/${next.path}`, undefined, true).path;
        Object.assign(next, {path: path});
        result.next = next;
      }
      if (result.paging && result.paging.previous) {
        const previous = parse(result.paging.previous);
        const path = parse(`/${previous.path}`, undefined, true).path;
        Object.assign(previous, {path: path});
        result.previous = parse(result.paging.previous);
      }

      return result;
    }

    return {};
  }

  async extend(client_id: string, client_secret: string): Promise<FacebookResponse> {
    const result: FacebookResponse = await this.get("oauth/access_token",
      {
        client_id: client_id,
        client_secret: client_secret,
        fb_exchange_token: this.accessToken,
        grant_type: 'fb_exchange_token',
        access_token: undefined
      });
    result.access_token && (this.accessToken = result.access_token);

    return result;
  }

  async paginate(path: string, params: { q?: string, type?: string, fields?: {}, limit: number }, size: number): Promise<Array<{}>> {
    let result: FacebookResponse = await this.get(path, params);
    let entities = result.data || [];
    let counter = entities.length;

    const { limit }: { limit: number } = params;

    while (result.next && result.next.path && counter < size) {
      result = await this.get(result.next.path, { limit });
      result.data && entities.push(...result.data);
    }

    return entities.slice(0, size);
  }

  async fetch(id: string, type: string, size: number = 10): Promise<Array<{}>> {
    const requestPath = `${id}/${type}`;
    return await this.paginate(requestPath, { limit: 25 }, size);
  }

  async search({ q, type, fields }: { q: string, type: string, fields: {} }, size: number = 25): Promise<Array<{}>> {
    return await this.paginate('search', { q, type, fields, limit: 25 }, size);
  }

  // https://developers.facebook.com/docs/graph-api/reference/page/photos/#upload
  async postImage(
    id: string,
    { caption, url, published }:
      { caption?: string, url: string, published?: 'true' | 'false'}): Promise<MediaResponse> {
    const response = await this.request(
      `${id}/photos`,
      { caption, url, published},
      'POST'
    );
    return response.data as MediaResponse;
  }

  async postVideo(id: string,
                  { description, file_url }: { description: string, file_url: string },
                  delay?: number): Promise<MediaResponse> {
    const params = { description, file_url };
    if(delay
      && delay > FACEBOOK_SCHEDULE_MIN_DURATION.asMilliseconds()
      && delay < FACEBOOK_SCHEDULE_MAX_DURATION.asMilliseconds()) {
      const delayMoment = moment().add(delay, 'milliseconds');
      Object.assign(params, {
        published: 'false',
        scheduled_publish_time: `${delayMoment.unix()}`
      })
    }

    const response = await this.request(`${id}/videos`, params,'POST');
    return response.data as MediaResponse;
  }

  async post(
    id: string,
    { message, link, no_story = false }: { message: string, link?: string, no_story?: boolean },
    mediaIds?: string[],
    delay?: number): Promise<{}> {
    const params = { message, link, no_story };

    if (mediaIds) {
      mediaIds.forEach((id, index) => {
        Object.assign(params, {
          [`attached_media[${index}]`] : `{media_fbid:${id}}`
        })
      })
    }

    if(delay
      && delay > FACEBOOK_SCHEDULE_MIN_DURATION.asMilliseconds()
      && delay < FACEBOOK_SCHEDULE_MAX_DURATION.asMilliseconds()) {
      const delayMoment = moment().add(delay, 'milliseconds');
      Object.assign(params, {
        published: 'false',
        scheduled_publish_time: `${delayMoment.unix()}`
      })
    }

    const response = await this.request(`${id}/feed`, params, 'POST');

    if (response && response.data) {
      return response.data;
    }

    return {};
  }

  // https://developers.facebook.com/docs/graph-api/making-multiple-requests/
  async batch(batch: {}[]): Promise<Response> {
    const response = this.request(``, {
      batch: JSON.stringify(batch),
      include_headers: 'false'    // Included to remove header information
    }, 'POST');

    return response;
  }

  async del(id: string): Promise<Response> {
    const response = this.request(`${id}`, {}, 'DELETE');

    return response;
  }

  protected fieldsBuilder = (fields: any): string => {
    const queries: string[] = [];
    if (typeof fields === 'string') {
      queries.push(fields);
    }

    if (typeof fields === 'object' && Object.prototype.toString.call(fields) === '[object Object]') {
      const keys = Object.keys(fields);
      keys.forEach(key => {
        const value = fields[key];
        queries.push(`${key}{${this.fieldsBuilder(value)}}`);
      });
    }

    if (typeof fields === 'object' && Object.prototype.toString.call(fields) === '[object Array]') {
      fields.forEach((field: any) => {
        queries.push(this.fieldsBuilder(field));
      });
    }

    return queries.join(',');
  };
}

module.exports.FacebookGraph;
