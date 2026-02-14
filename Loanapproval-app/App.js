import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Login from './src/component/Login/Login';
import Application from './src/component/application/application';
import ExistingLoanDetails from './src/component/existingloandetails/existingloandetails';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Application" component={Application} />
        <Stack.Screen name="ExistingLoanDetails" component={ExistingLoanDetails} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
