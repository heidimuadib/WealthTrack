import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId, sharedExpenseId }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const EditSharedExpenseScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeEditExpense" navigation={navigation} />
);

export default EditSharedExpenseScreen;
