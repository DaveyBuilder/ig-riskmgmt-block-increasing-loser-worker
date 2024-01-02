import { loginIG } from './helper_functions/login_ig.js';
import { getOpenPositions } from './helper_functions/open_positions.js';
import {isMarketOpen} from './helper_functions/is_market_open.js';

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

    const openPositions = await getOpenPositions(env, CST, X_SECURITY_TOKEN, baseURL);

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
                if (instrument !== 'EU Stocks 50' && instrument !== 'Alphabet Inc - A (All Sessions)' && instrument !== 'USD/JPY') {
                    // If so, push the current position to the positionsForClosure array
                    positionsForClosure.push(positions[i]);
                }
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
    
    const closePositionHeaders = {
        'Content-Type': 'application/json',
        'X-IG-API-KEY': env.IG_API_KEY,
        'Version': '1',
        'CST': CST,
        'X-SECURITY-TOKEN': X_SECURITY_TOKEN,
        '_method': 'DELETE'
    };

    // Iterate over positionsToClose and make a request for each
    for (const position of positionsToClose) {
        const response = await fetch(`${baseURL}/positions/otc`, {
            method: 'POST',
            headers: closePositionHeaders,
            body: JSON.stringify(position)
        });

        if (!response.ok) {
            console.error(`Failed to close position. Status code: ${response.status}`);
        } else {
            console.log(`Position closed successfully.`);
        }
    }

    //return positionsToClose;

}