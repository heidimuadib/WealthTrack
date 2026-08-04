import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId, sharedExpenseId }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const SharedExpenseDetailScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeExpenseDetail" navigation={navigation} />
);

export default SharedExpenseDetailScreen;
