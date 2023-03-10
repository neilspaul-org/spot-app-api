const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const gravatar = require("gravatar");
const jwt = require("jsonwebtoken");
const config = require("../../config/config");
const uniqid = require("uniqid");

const { check, validationResult } = require("express-validator");
const User = require("../../models/User");

const { DateTime } = require("luxon");
const { findOne } = require("../../models/User");
const { jwt: { jwtAccessSecret, jwtRefreshSecret } } = config;
const { plaid: { client_id, secret, env } } = config;

const { Configuration, PlaidApi, Products, PlaidEnvironments } = require('plaid');

const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': client_id,
            'PLAID-SECRET': secret,
            'Plaid-Version': '2020-09-14',
        },
    },
});

const client = new PlaidApi(configuration);


//const misc = require("../api/misc");






// @Route   POST /api/v1/plaid/link/token/create
// @Desc    sync mongo and firebase
// @Access  Requires Client ID and secret for authentication
router.post(
    "/link/token/create",
    [
        check("client_id", "Invalid Client ID").not().isEmpty(),
        check("client_secret", "Invalid Client Secret").not().isEmpty(),
        check("firebase_id", "Firebase UID is required").not().isEmpty(),

    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        var {
            client_id,
            client_secret,
            firebase_id,
        } = req.body;

        //check client id and secret
        if (client_id !== process.env.ONBOARD_CLIENT_ID) {
            //save failed attempt
            return res.status(400).send({ error: "Invalid Client ID or Secret" });
        }

        if (client_secret !== process.env.ONBOARD_CLIENT_SECRET) {
            //save failed attempt
            return res.status(400).send({ error: "Invalid Client ID or Secret" });
        }


        try {

            var current_user_token = "";
            const currentUser = await User.findOne({
                firebase_id: firebase_id,
            });

            if (!currentUser) {
                return res.status(400).send({ error: "Invalid Firebase ID" });
            }

            if (currentUser.user_token == "") {
                const create_user = await client.userCreate({
                    client_user_id: firebase_id,
                });

                const update_user = await User.findOneAndUpdate(
                    { firebase_id: firebase_id },
                    { user_token: create_user.data.user_token, });

                current_user_token = create_user.data.user_token;

            } else {
                current_user_token = currentUser.user_token;
            }





            const request = {
                user: {
                    // This should correspond to a unique id for the current user.
                    client_user_id: firebase_id,
                },
                client_name: 'Plaid Test App',
                products: ['income_verification'],
                language: 'en',
                webhook: 'https://webhook.example.com',
                redirect_uri: 'http://localhost:3000/api/plaid/redirect',
                country_codes: ['US'],
                income_verification: {
                    income_source_types: ['bank'],
                    bank_income: {
                        days_requested: 15

                    }
                },
                user_token: current_user_token,

            };


            const createTokenResponse = await client.linkTokenCreate(request);
            return res.json(createTokenResponse.data);

        } catch (err) {
            console.error(err.message);
            res.status(500).send({ error: `something went wrong : ${err.message}` });
        }
    }
);




// @Route   POST /api/v1/plaid/exchange/token
// @Desc    sync mongo and firebase
// @Access  Requires Client ID and secret for authentication
router.post(
    "/exchange/token",
    [
        check("client_id", "Invalid Client ID").not().isEmpty(),
        check("client_secret", "Invalid Client Secret").not().isEmpty(),
        check("firebase_id", "Firebase UID is required").not().isEmpty(),
        check("public_token", "Public Token is required").not().isEmpty(),

    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        var {
            client_id,
            client_secret,
            firebase_id,
            public_token,
        } = req.body;

        //check client id and secret
        if (client_id !== process.env.ONBOARD_CLIENT_ID) {
            //save failed attempt
            return res.status(400).send({ error: "Invalid Client ID or Secret" });
        }

        if (client_secret !== process.env.ONBOARD_CLIENT_SECRET) {
            //save failed attempt
            return res.status(400).send({ error: "Invalid Client ID or Secret" });
        }


        try {


            const currentUser = await User.findOne({
                firebase_id: firebase_id,
            });

            if (!currentUser) {
                return res.status(400).send({ error: "Invalid Firebase ID" });
            }


            const response = await client.itemPublicTokenExchange({
                public_token: public_token,
            });
            // These values should be saved to a persistent database and
            // associated with the currently signed-in user
            const accessToken = response.data.access_token;
            const itemID = response.data.item_id;

            //save access token and item id to user

            const updateUser = await User.findOneAndUpdate(
                { firebase_id: firebase_id },
                {
                    plaid_access_token: accessToken,
                    plaid_item_id: itemID,
                });



            res.json({ message: 'success' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send({ error: `something went wrong : ${err.message}` });
        }
    }
);





// @Route   POST /api/v1/plaid/check/income
// @Desc    sync mongo and firebase
// @Access  Requires Client ID and secret for authentication
router.post(
    "/check/income",
    [
        check("client_id", "Invalid Client ID").not().isEmpty(),
        check("client_secret", "Invalid Client Secret").not().isEmpty(),
        check("firebase_id", "Firebase UID is required").not().isEmpty(),

    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        var {
            client_id,
            client_secret,
            firebase_id,
            public_token,
        } = req.body;

        //check client id and secret
        if (client_id !== process.env.ONBOARD_CLIENT_ID) {
            //save failed attempt
            return res.status(400).send({ error: "Invalid Client ID or Secret" });
        }

        if (client_secret !== process.env.ONBOARD_CLIENT_SECRET) {
            //save failed attempt
            return res.status(400).send({ error: "Invalid Client ID or Secret" });
        }


        try {


            const currentUser = await User.findOne({
                firebase_id: firebase_id,
            });

            if (!currentUser) {
                return res.status(400).send({ error: "Invalid Firebase ID" });
            }

            if (currentUser.plaid_access_token == "") {
                return res.status(400).send({ error: "Invalid Plaid Access Token, account not connected" });
            }

            const request = {
                user_token: currentUser.user_token,
                options: {
                    count: 1,
                },
            };

            const inc = await client.creditBankIncomeGet(request);

            const currentIncome = inc.data.bank_income[0].bank_income_summary.total_amount;

            if (currentIncome < 500) {
                return res.status(403).send({ error: "Income is less than $500" });
            }



            res.json({ message: 'success', income: currentIncome });
        } catch (err) {
            console.error(err);
            res.status(500).send({ error: `something went wrong : ${err.message}` });
        }
    }
);


module.exports = router;