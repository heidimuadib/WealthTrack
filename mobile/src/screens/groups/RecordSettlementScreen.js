import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId, fromMemberId?, toMemberId? }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const RecordSettlementScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeSettle" navigation={navigation} />
);

export default RecordSettlementScreen;
