import { Facebook, FacebookTokenInspecting, FacebookTokenType } from './facebook';
import * as _ from 'lodash';
// const { Facebook, FacebookTokenInspecting, FacebookTokenType } = require('./facebook')
const express = require('express')
const app = express()
const port = 4000

app.get("/ok", async (req, res) => {
   postFacebook('308737679730417','EAALPt44xDS8BAAFloA5rTZA408KUT77UeCZAcq9e2qwyD4UQYFw9hF3sRFhBJ4MF1mgLgJqWh1ShAZBAJoajdIl1VUOrNKTN9D5k9TiZBKos27EZA58r4AICFUCHGsnCL4c2qKDwSeb9FfAwgQUiPaOrV0ZBF4Rf8KFyrPEkqrycs1YcZAuYi11pd5TrMZAZCHXGzFDHUt2pu5AZDZD','duy luong', null,null)
});

async function postFacebook(pageId, access_token, postText,
    photoUrls, videoUrl) {
        const FacebookLib = new Facebook(access_token, '8.0');

        // 1. Generate appToken
        const appToken = await FacebookLib.generateAppToken();
        if (!appToken) {
        throw Error('Error generating app token');
        }

        // 2. Token verification
        const inspectingResult = await FacebookLib.get('debug_token', {
        input_token: access_token,
        access_token: appToken
        });
        const inspectingResultData = inspectingResult.data as any;

        console.log('inspectingResultData',JSON.stringify(inspectingResultData));
        
        const tokenType = inspectingResultData && inspectingResultData.type;
        const tokenPageId = inspectingResultData && inspectingResultData.profile_id;
        const is_valid = inspectingResultData && inspectingResultData.is_valid;
        const scopes = inspectingResultData && inspectingResultData.scopes || [];
        console.log('scopes',scopes);


        if (!is_valid) {
        throw Error('The externalToken is invalid');
        }
        if (_.difference(['pages_manage_posts', 'pages_read_user_content'], scopes).length !== 0) {
            throw Error('The publish permission is not granted');
        }

        if (tokenType == FacebookTokenType.PAGE && tokenPageId !== pageId) {
        throw Error('The targetId is invalid');
        }

        // 3. Generate long-live user access_token if possible
        await FacebookLib.generateLongLiveUserAccessToken();

        // 4. Get Facebook post token
        if (tokenType == FacebookTokenType.USER) {
        const page_token = await FacebookLib.getPageAccessToken(pageId);
        console.log('page token',page_token);
        
        await FacebookLib.updateAccessToken(page_token);
        } else if (tokenType == FacebookTokenType.PAGE) {
        // Don't do anything
        // await FacebookLib.updateAccessToken(access_token);
        }

        // 5.1 Post video
        if (videoUrl) {
        const videoRes = await FacebookLib.postVideo(pageId, {
        file_url: videoUrl,
        description: postText || ''
        });
        console.log(JSON.stringify(videoRes));
        console.log('Post done');
        return;
        }

        // 5.2 Post status/photos
        // Upload each photo
        const photoIds = [];
        for (let url of (photoUrls || [])) {
        const imageRes = await FacebookLib.postImage(pageId, {
        caption: `Image ${(photoUrls || []).indexOf(url) + 1} of ${(photoUrls || []).length}`,
        url: url,
        published: 'false'
        });

        const imageId = imageRes.id;
        imageId && photoIds.push(imageId);
        }

        // Create feed post
        // https://developers.facebook.com/docs/graph-api/reference/v4.0/page/feed#publish
        const postRes = await FacebookLib.post(pageId, {
        message: postText || ''
        }, photoIds);

        console.log(JSON.stringify(postRes));
        console.log('Post done');
}

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
