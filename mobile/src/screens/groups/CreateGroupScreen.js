import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: none
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const CreateGroupScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeCreate" navigation={navigation} />
);

export default CreateGroupScreen;
