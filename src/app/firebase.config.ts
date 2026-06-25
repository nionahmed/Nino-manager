import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC0z62ltOsNP2jA-C5-ocpwzrIwpX6yvEU",
  authDomain: "nino-manager.firebaseapp.com",
  databaseURL: "https://nino-manager-default-rtdb.firebaseio.com",
  projectId: "nino-manager",
  storageBucket: "nino-manager.firebasestorage.app",
  messagingSenderId: "671745355228",
  appId: "1:671745355228:web:3c731b22efc9997cfc3319",
  measurementId: "G-WQD95E8LEP"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
