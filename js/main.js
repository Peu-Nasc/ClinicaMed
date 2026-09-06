import { initAuth } from './login.js';
import { initUI } from './NavMenu.js';
import { initMasks, initConfirmacao, initFooterInstitucional } from './Ferramentas.js';
import { initPacientes, atualizarTabelaPacientes, carregarPacientes } from './pacientes.js';
import { initFinanceiro, calcularDRE, atualizarTabelaFinanceiro, atualizarTabelaCustosFixos } from './financeiro.js';
import { initEstoque, atualizarTabelaEstoque } from './estoque.js';
import { initProcedimentos } from './procedimentos.js';
import { initPacotes } from './pacotes.js';
import { initAgenda, atualizarAgenda } from './agenda.js';
import { initNotificacoes } from './notificacoes.js';
import { initAuditoria } from './auditoria.js';
import { initAjuda } from './ajuda.js';

// ========================================================
// TRAVA ANTI-SPAM (PREVENÇÃO DE MÚLTIPLAS REQUISIÇÕES)
// Cria um intervalo (cooldown) obrigatório de 1 segundo 
// entre cliques repetidos em qualquer botão do sistema.
// ========================================================
let ultimoClique = 0;
document.addEventListener('click', (e) => {
    // Verifica se o que foi clicado é um botão ou um ícone dentro dele
    const btn = e.target.closest('button');
    if (btn) {
        const agora = Date.now();
        // Se o último clique foi há menos de 1000 milissegundos (1s), bloqueia!
        if (agora - ultimoClique < 1000) {
            e.preventDefault();     // Impede o formulário de ser enviado
            e.stopPropagation();    // Impede o JavaScript de executar a ação
            return;
        }
        ultimoClique = agora;
    }
}, true); // O parâmetro 'true' força essa verificação a rodar ANTES das outras

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    initMasks();
    initUI();
    initConfirmacao();
    initFooterInstitucional();

    initPacientes();
    initFinanceiro();
    initEstoque();
    initProcedimentos();
    initPacotes();
    initAgenda();
    initNotificacoes();
    initAuditoria();
    initAjuda();

    calcularDRE();
    atualizarTabelaFinanceiro();
    atualizarTabelaCustosFixos();
    atualizarTabelaEstoque();
    atualizarAgenda();
});