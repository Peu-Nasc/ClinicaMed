// Importações do Firebase (mantenha as versões que você já estava usando)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Lê o endereço que o cliente digitou no navegador
const host = window.location.hostname;
let firebaseConfig;

// ROTEAMENTO DE BANCO DE DADOS POR SUBDOMÍNIO
if (host === 'elisangela.sistemavitalis.com.br') {
    
    // 1. Banco de Dados: Clínica Elisangela (TEA)
    const firebaseConfig = {
    apiKey: "AIzaSyAUL4a9jX__kx2dR-dZioalQxM7QxZPSl0",
    authDomain: "vitalis---elisangela.firebaseapp.com",
    projectId: "vitalis---elisangela",
    storageBucket: "vitalis---elisangela.firebasestorage.app",
    messagingSenderId: "527275326414",
    appId: "1:527275326414:web:d9bc13089c42f5d783499f"
  };

} else if (host === 'daniel.sistemavitalis.com.br') {
    
    // 2. Banco de Dados: Clínica Dr. Daniel
    const firebaseConfig = {
    apiKey: "AIzaSyCF_cc8t8cqB1iYjKku1r7pzIJa5d0029U",
    authDomain: "vitalis---daniel.firebaseapp.com",
    projectId: "vitalis---daniel",
    storageBucket: "vitalis---daniel.firebasestorage.app",
    messagingSenderId: "266266312840",
    appId: "1:266266312840:web:0e0ce38a1c597898009f3d"
  };

} else {
    
    // 3. AMBIENTE DE DESENVOLVIMENTO (VSCode / Localhost / Domínio Raiz)
    // Se você estiver testando no seu computador (127.0.0.1 ou localhost), 
    // ou se alguém acessar apenas sistemavitalis.com.br, ele cai aqui.
    // Dica: Coloque aqui as chaves de um projeto de testes seu.
    firebaseConfig = {
        apiKey: "SUA_API_KEY_DE_TESTE",
        authDomain: "vitalis-teste.firebaseapp.com",
        projectId: "vitalis-teste",
        // ...
    };
}

// Inicializa o Firebase com a chave correta escolhida acima
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Exporta para o resto do sistema usar (login.js, agenda.js, etc.)
export { app, db, auth };