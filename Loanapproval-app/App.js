import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Login from './src/component/Login/Login';
import Application from './src/component/application/application';
import ExistingLoanDetails from './src/component/existingloandetails/existingloandetails';
import DocumentUploadPage from './src/component/document-upload-page/document-upload-page';
import ResultPage from './src/component/result-page/result-page';

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
        <Stack.Screen name="DocumentUploadPage" component={DocumentUploadPage} />
        <Stack.Screen name="ResultPage" component={ResultPage} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
