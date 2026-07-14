// Importando as funções da versão 12.16.0
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { clinicaState } from './state.js';


// A sua configuração real e exclusiva do banco de dados
const firebaseConfig = {
    apiKey: "AIzaSyD0IiMD48j88dVv2XAnRIItJjoTEITEMiw",
    authDomain: "clinicamed-69b57.firebaseapp.com",
    projectId: "clinicamed-69b57",
    storageBucket: "clinicamed-69b57.firebasestorage.app",
    messagingSenderId: "887597358188",
    appId: "1:887597358188:web:80602df42ef4039fb90c49"
};

// Inicializando os serviços
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Exportando os métodos que a tela de login e as tabelas vão usar
export { signInWithEmailAndPassword, signOut, onAuthStateChanged };
export { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc };