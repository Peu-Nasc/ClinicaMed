// Aqui colocamos tudo que é usado em vários lugares do sistema
import { clinicaState } from './state.js';

export const formatCurrency = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

export function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

// ========================================================
// CRIPTOGRAFIA (centralizada - antes cada arquivo calculava
// a própria chave e reimplementava encriptar/decriptar)
// ========================================================
function obterChaveSecreta() {
    return "GestaoPRO_" + clinicaState.sessao.clinicaId;
}

export function encriptar(texto) {
    if (!texto) return '';
    return CryptoJS.AES.encrypt(texto, obterChaveSecreta()).toString();
}

export function decriptar(textoCripto) {
    if (!textoCripto) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(textoCripto, obterChaveSecreta());
        const original = bytes.toString(CryptoJS.enc.Utf8);
        return original || textoCripto;
    } catch (e) {
        return textoCripto;
    }
}

// ========================================================
// ESTADO DE CARREGAMENTO DE BOTÃO (antes repetido em todo
// formulário: guardar innerHTML, trocar por spinner, desabilitar,
// e no final restaurar - agora é uma linha só)
// ========================================================
export async function comEstadoDeCarregamento(botao, textoCarregando, fn) {
    const textoOriginal = botao.innerHTML;
    botao.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${textoCarregando}`;
    botao.disabled = true;
    try {
        await fn();
    } finally {
        botao.innerHTML = textoOriginal;
        botao.disabled = false;
    }
}

// Renderiza um grid de cards de indicador (usado no dashboard, financeiro e estoque)
// cards: [{ id, label, initial, variant: 'success'|'danger'|'warning'|'primary', valueClass, compact }]
export function renderCardGrid(containerId, cards) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = cards.map(c => `
        <div class="card card-info${c.variant ? ' card-' + c.variant : ''}${c.compact ? ' card-compact' : ''}">
            <h3>${c.label}</h3>
            <p class="big-number${c.valueClass ? ' ' + c.valueClass : ''}" id="${c.id}">${c.initial ?? ''}</p>
        </div>
    `).join('');
}

// Inicialização das máscaras do IMask
export function initMasks() {
    const maskOptions = {
        cpf: { mask: '000.000.000-00' },
        telefone: { mask: '(00) 00000-0000' },
        moeda: { mask: Number, scale: 2, thousandsSeparator: '.', padFractionalZeros: true, normalizeZeros: true, radix: ',' }
    };
    
    IMask(document.getElementById('cad-cpf-check'), maskOptions.cpf);
    IMask(document.getElementById('cad-cpf'), maskOptions.cpf);
    IMask(document.getElementById('cad-tel'), maskOptions.telefone);
    IMask(document.getElementById('fin-valor'), maskOptions.moeda);
}