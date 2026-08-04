import { initAuth } from './login.js';
import { initUI } from './NavMenu.js';
import { initMasks, initConfirmacao } from './Ferramentas.js';
import { initPacientes, atualizarTabelaPacientes, carregarPacientes } from './pacientes.js';
import { initFinanceiro, calcularDRE, atualizarTabelaFinanceiro, atualizarTabelaCustosFixos } from './financeiro.js';
import { initEstoque, atualizarTabelaEstoque } from './estoque.js';
import { initAgenda, atualizarAgenda } from './agenda.js';
import { initNotificacoes } from './notificacoes.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    initMasks();
    initUI();
    initConfirmacao();

    initPacientes();
    initFinanceiro();
    initEstoque();
    initAgenda();
    initNotificacoes();

    calcularDRE();
    atualizarTabelaFinanceiro();
    atualizarTabelaCustosFixos();
    atualizarTabelaEstoque();
    atualizarAgenda();
});