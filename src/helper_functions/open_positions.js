export async function getOpenPositions(env, CST, X_SECURITY_TOKEN, baseURL, accountBalance) {

    const openPositionsResponse = await fetch(`${baseURL}/positions`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-IG-API-KEY': env.IG_API_KEY,
            'Version': '2',
            'CST': CST,
            'X-SECURITY-TOKEN': X_SECURITY_TOKEN
        }
    });

    if (!openPositionsResponse.ok) {
        throw new Error(`Error getting open positions. HTTP status: ${openPositionsResponse.status}`);
    }

    const openPositionsData = await openPositionsResponse.json();

    // Initialize an empty object to store the summed profit and loss for each market
    let openSummedPositions = {};

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

        if (openSummedPositions[instrumentName]) {
            openSummedPositions[instrumentName].positions.push(position);
        } else {
            openSummedPositions[instrumentName] = {positions: [position] };
        }

    });


    return openSummedPositions;
}