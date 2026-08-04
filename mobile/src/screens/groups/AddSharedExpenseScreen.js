import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const AddSharedExpenseScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeAddExpense" navigation={navigation} />
);

export default AddSharedExpenseScreen;
