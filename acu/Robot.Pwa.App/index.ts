import { registerRootComponent } from "expo";

import App from "./src/App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App),
// and sets up the environment appropriately whether running in Expo Go, a native
// build, or the web (Metro) bundler — the RN equivalent of main.tsx's createRoot(...).render(<App/>).
registerRootComponent(App);
