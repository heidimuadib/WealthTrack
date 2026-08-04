import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId, settlementId }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const EditSettlementScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeEditSettlement" navigation={navigation} />
);

export default EditSettlementScreen;
