import { loginIG } from './helper_functions/login_ig.js';
import { getOpenPositions } from './helper_functions/open_positions.js';
import {isMarketOpen} from './helper_functions/is_market_open.js';
import { closePosition } from './helper_functions/close_position.js';

export async function executeScheduledTask(request, env, ctx, usingDemoAccount) {
    
    let baseURL;
    if (usingDemoAccount) {
        baseURL = 'https://demo-api.ig.com/gateway/deal';
    } else {
        baseURL = 'https://api.ig.com/gateway/deal';
    }

    const { CST, X_SECURITY_TOKEN } = await loginIG(env, baseURL);

    // Check if nasdaq 100 futures are open & exit if not
	const marketStatus = await isMarketOpen(env, CST, X_SECURITY_TOKEN, baseURL);
	if (marketStatus === "EDITS_ONLY") {
		return;
	}

    const openPositionsData = await getOpenPositions(env, CST, X_SECURITY_TOKEN, baseURL);

    // Initialize an empty object to store the summed profit and loss for each market
    let openPositions = {};

    openPositionsData.positions.forEach(position => {

        const instrumentName = position.market.instrumentName;
        const direction = position.position.direction;
        const positionSize = position.position.size;

        let pl;

        if (direction === 'BUY') {
            const price = position.market.bid;
            // Using Math.round() to keep the pl at 2 decimal places
            pl = Math.round((price - position.position.level) * positionSize * 100) / 100;
        } else if (direction === 'SELL') {
            const price = position.market.offer;
            pl = Math.round((position.position.level - price) * positionSize * 100) / 100;
        }

        position.pl = pl;

        if (openPositions[instrumentName]) {
            openPositions[instrumentName].positions.push(position);
        } else {
            openPositions[instrumentName] = {positions: [position] };
        }

    });

    // For each instrument, sort it's positions by createdDateUTC
    for (const instrument in openPositions) {
        openPositions[instrument].positions.sort((a, b) => {
            return new Date(a.position.createdDateUTC) - new Date(b.position.createdDateUTC);
        });
    }

    const positionsForClosure = [];

    for (const instrument in openPositions) {
        const positions = openPositions[instrument].positions;
        for (let i = 1; i < positions.length; i++) {
            // Check if the previous position had a negative pl value at the point when 2nd position was opened
            const levelCurrentPosition = positions[i].position.level;
            const levelPreviousPosition = positions[i - 1].position.level;
            const direction = positions[i].position.direction;
            let difference;
            if (direction === 'BUY') {
                difference = levelCurrentPosition - levelPreviousPosition;
            } else if (direction === 'SELL') {
                difference = levelPreviousPosition - levelCurrentPosition;
            }

            if (difference <= 0) {
                // If so, push the current position to the positionsForClosure array
                positionsForClosure.push(positions[i]);
            }

        }
    }

    const positionsToClose = [];
   
    // Create the array that contains the details needed for closure
    for (const item of positionsForClosure) {
        if (item.market.marketStatus === "TRADEABLE") {
            const positionDetailsForClosure = {
                dealId: item.position.dealId,
                epic: null,
                expiry: null,
                direction: item.position.direction === "BUY" ? "SELL" : "BUY",
                size: String(item.position.size),
                level: null,
                orderType: "MARKET",
                timeInForce: "FILL_OR_KILL",
                quoteId: null,
            };
            positionsToClose.push(positionDetailsForClosure);
        }
    }

    // Now close each position in positionsToClose

    // Iterate over positionsToClose and make a request for each
    let closedPositionsErrors = [];
    for (const position of positionsToClose) {
        try {
            await closePosition(env, CST, X_SECURITY_TOKEN, baseURL, position);
        } catch (error) {
            closedPositionsErrors.push(error);
        }
    }

    if (closedPositionsErrors.length > 0) {
        throw new Error(`Failed to close positions: ${closedPositionsErrors.map(error => error.message).join(", ")}`);
    }

}