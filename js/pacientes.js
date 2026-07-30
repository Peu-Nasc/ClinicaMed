import { clinicaState } from './state.js';
import { showToast, escapeHTML } from './Ferramentas.js';
import { atualizarAgenda } from './agenda.js';

import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from './firebase.js';

let pacienteAtivoId = null;
let pacienteEmEdicaoId = null; 

export function initPacientes() {
    const modalCadastro = document.getElementById('modal-cadastro');
    const tipoCadastro = document.getElementById('tipo-cadastro');
    
    document.getElementById('btn-novo-paciente').addEventListener('click', () => abrirModalCadastro('paciente'));
    document.getElementById('btn-novo-profissional').addEventListener('click', () => abrirModalCadastro('profissional'));
    document.getElementById('btn-close-cadastro').addEventListener('click', () => { 
        modalCadastro.classList.remove('active');
        pacienteEmEdicaoId = null; 
    });

    function abrirModalCadastro(tipo) {
        document.getElementById('form-cadastro').reset();
        tipoCadastro.value = tipo;
        const isPac = tipo === 'paciente';
        
        document.querySelectorAll('.paciente-only').forEach(el => el.style.display = isPac ? 'grid' : 'none');
        document.querySelectorAll('.profissional-only').forEach(el => el.style.display = !isPac ? 'grid' : 'none');
        
        if(isPac) {
            document.getElementById('step-verificacao-cpf').style.display = 'block';
            document.getElementById('step-dados-cadastrais').style.display = 'none';
        } else {
            document.getElementById('step-verificacao-cpf').style.display = 'none';
            document.getElementById('cad-cpf').removeAttribute('readonly');
            document.getElementById('cad-cpf').style.backgroundColor = '#fbfbfc';
            document.getElementById('step-dados-cadastrais').style.display = 'grid';
        }
        modalCadastro.classList.add('active');
    }

    tipoCadastro.addEventListener('change', (e) => abrirModalCadastro(e.target.value));

    document.getElementById('btn-verificar-cpf').addEventListener('click', () => {
        const cpfDigitado = document.getElementById('cad-cpf-check').value.trim();
        if(!cpfDigitado) return showToast('Por favor, digite o CPF para verificação.', 'warning');
        
        const pacienteExistente = clinicaState.pacientes.find(p => p.cpf === cpfDigitado);
        if(pacienteExistente) {
            showToast(`Paciente já cadastrado: ${pacienteExistente.nome}. Abrindo prontuário...`, 'warning');
            modalCadastro.classList.remove('active');
            abrirProntuario(pacienteExistente.id);
        } else {
            document.getElementById('cad-cpf').value = cpfDigitado;
            document.getElementById('step-verificacao-cpf').style.display = 'none';
            document.getElementById('step-dados-cadastrais').style.display = 'grid';
            showToast('CPF liberado para novo cadastro.', 'success');
        }
    });

    // ==========================================
    // SALVAMENTO DE CADASTRO COM CRIPTOGRAFIA
    // ==========================================
    document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipo = tipoCadastro.value;

        if (tipo === 'profissional') {
            const conselho = document.getElementById('cad-conselho').value.trim();
            const registro = document.getElementById('cad-num-registro').value.trim();
            if (!conselho || !registro) {
                showToast('O Conselho (ex: CRM) e o Registro são obrigatórios por lei!', 'warning');
                return; 
            }
        }

        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoBotaoOriginal = btnSalvar.innerHTML;
        
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
        btnSalvar.disabled = true;

        const chaveSecreta = "GestaoPRO_" + clinicaState.sessao.clinicaId;
        const encriptar = (texto) => texto ? CryptoJS.AES.encrypt(texto, chaveSecreta).toString() : '';

        const baseData = {
            nome: encriptar(document.getElementById('cad-nome').value),
            cpf: encriptar(document.getElementById('cad-cpf').value),
            rg: encriptar(document.getElementById('cad-rg').value),
            nascimento: encriptar(document.getElementById('cad-nascimento').value),
            mae: encriptar(document.getElementById('cad-mae').value),
            telefone: encriptar(document.getElementById('cad-tel').value),
            email: encriptar(document.getElementById('cad-email').value),
            dataCadastro: new Date().toISOString(),
            clinicaId: clinicaState.sessao.clinicaId 
        };

        try {
            if (tipo === 'paciente') {
                const dadosParaSalvar = {
                    ...baseData,
                    sangue: encriptar(document.getElementById('cad-sangue').value),
                    alergias: encriptar(document.getElementById('cad-alergias').value),
                    convenio: encriptar(document.getElementById('cad-convenio').value || 'Particular'),
                    carteirinha: encriptar(document.getElementById('cad-carteirinha').value),
                    emergencia: encriptar(document.getElementById('cad-emergencia').value),
                    responsavel: encriptar(document.getElementById('cad-responsavel').value)
                };

                if (pacienteEmEdicaoId) {
                    await updateDoc(doc(db, "pacientes", pacienteEmEdicaoId), dadosParaSalvar);
                    showToast('Dados do paciente atualizados!', 'success');
                } else {
                    dadosParaSalvar.evolucoes = [];
                    await addDoc(collection(db, "pacientes"), dadosParaSalvar);
                    showToast('Paciente salvo e criptografado com sucesso!', 'success');
                }
            } else {
                await addDoc(collection(db, "profissionais"), {
                    ...baseData,
                    conselho: encriptar(document.getElementById('cad-conselho').value),
                    registro: encriptar(document.getElementById('cad-num-registro').value),
                    especialidade: encriptar(document.getElementById('cad-especialidade').value),
                    rqe: encriptar(document.getElementById('cad-rqe').value),
                    vinculo: encriptar(document.getElementById('cad-vinculo').value)
                });
                showToast('Profissional salvo e criptografado com sucesso!', 'success');
            }

            modalCadastro.classList.remove('active');
            e.target.reset();
            pacienteEmEdicaoId = null; 
            
            await carregarPacientes(); 
            await carregarProfissionais();

        } catch (error) {
            console.error("Erro ao salvar no Firestore: ", error);
            showToast('Erro de conexão ao salvar os dados.', 'error');
        } finally {
            btnSalvar.innerHTML = textoBotaoOriginal;
            btnSalvar.disabled = false;
        }
    });

    document.getElementById('btn-fechar-pep').addEventListener('click', () => {
        document.getElementById('prontuario-ativo').style.display = 'none';
        const listaContainer = document.getElementById('lista-pacientes-container');
        if (listaContainer) listaContainer.style.display = 'block';
        pacienteAtivoId = null;
        renderizarResumoPacienteAtivo();
    });

    // ==========================================
    // SALVAMENTO DE EVOLUÇÃO COM CRIPTOGRAFIA
    // ==========================================
    document.getElementById('form-evolucao').addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!pacienteAtivoId) return;
        
        const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacienteAtivoId));
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoBotaoOriginal = btnSalvar.innerHTML; 
        
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Assinando...';
        btnSalvar.disabled = true;

        const textoProntuario = `**Anamnese:** ${document.getElementById('pep-anamnese').value}
    **Exame Físico:** ${document.getElementById('pep-exame-fisico').value}
    **Diagnóstico:** ${document.getElementById('pep-diagnostico').value || 'N/A'}
    **Prescrição:** ${document.getElementById('pep-prescricao').value}`.trim(); 

        const chaveSecreta = "GestaoPRO_" + clinicaState.sessao.clinicaId;
        const textoCriptografado = CryptoJS.AES.encrypt(textoProntuario, chaveSecreta).toString();

        const profId = document.getElementById('pep-profissional').value;
        const profissional = clinicaState.profissionais.find(p => String(p.id) === String(profId));
        
        if (!profissional) {
            showToast('Selecione um profissional para assinar a ficha.', 'warning');
            btnSalvar.innerHTML = textoBotaoOriginal;
            btnSalvar.disabled = false;
            return;
        }

        const novaEvolucao = {
            data: new Date().toLocaleString('pt-BR'),
            texto: textoCriptografado,
            assinatura: `Assinado digitalmente por ${profissional.nome} | ${profissional.conselho}: ${profissional.registro}`
        };

        if (!paciente.evolucoes) paciente.evolucoes = [];
        paciente.evolucoes.push(novaEvolucao);

        try {
            const pacienteRef = doc(db, "pacientes", paciente.id);
            await updateDoc(pacienteRef, { evolucoes: paciente.evolucoes });
            
            renderizarEvolucoes(paciente);
            e.target.reset(); 
            
            if (clinicaState.sessao.perfil === 'Doutor(a)') {
                document.getElementById('pep-profissional').value = profId;
            }
            showToast('Evolução salva no Prontuário com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar evolução: ", error);
            showToast('Erro de conexão ao salvar ficha.', 'error');
            paciente.evolucoes.pop(); 
        } finally {
            btnSalvar.innerHTML = textoBotaoOriginal;
            btnSalvar.disabled = false;
        }
    });

    // ==========================================
    // DELEGAÇÃO DE EVENTOS DAS TABELAS
    // ==========================================
    const patientListBody = document.getElementById('patient-table-body-list');
    if (patientListBody) {
        patientListBody.addEventListener('click', async (e) => {
            const btnAbrir = e.target.closest('.btn-abrir-prontuario');
            const btnEditar = e.target.closest('.btn-editar-paciente');
            const btnExcluir = e.target.closest('.btn-excluir-paciente');

            if (btnAbrir) abrirProntuario(btnAbrir.getAttribute('data-id'));

            if (btnExcluir) {
                const idPac = btnExcluir.getAttribute('data-id');
                if (confirm('Atenção: Deseja excluir permanentemente este paciente?')) {
                    try {
                        await deleteDoc(doc(db, "pacientes", idPac));
                        showToast('Paciente excluído do sistema.', 'success');
                        await carregarPacientes();
                    } catch (error) {
                        showToast('Falha ao excluir paciente.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const idPac = btnEditar.getAttribute('data-id');
                const paciente = clinicaState.pacientes.find(p => String(p.id) === String(idPac));
                if (paciente) {
                    pacienteEmEdicaoId = paciente.id; 
                    document.getElementById('tipo-cadastro').value = 'paciente';
                    abrirModalCadastro('paciente'); 
                    document.getElementById('step-verificacao-cpf').style.display = 'none';
                    document.getElementById('step-dados-cadastrais').style.display = 'grid';
                    
                    document.getElementById('cad-nome').value = paciente.nome;
                    document.getElementById('cad-cpf').value = paciente.cpf;
                    document.getElementById('cad-rg').value = paciente.rg || '';
                    document.getElementById('cad-nascimento').value = paciente.nascimento;
                    document.getElementById('cad-mae').value = paciente.mae || '';
                    document.getElementById('cad-tel').value = paciente.telefone;
                    document.getElementById('cad-email').value = paciente.email || '';
                    document.getElementById('cad-sangue').value = paciente.sangue || '';
                    document.getElementById('cad-alergias').value = paciente.alergias || '';
                    document.getElementById('cad-convenio').value = paciente.convenio || '';
                    document.getElementById('cad-carteirinha').value = paciente.carteirinha || '';
                    document.getElementById('cad-emergencia').value = paciente.emergencia || '';
                    document.getElementById('cad-responsavel').value = paciente.responsavel || '';
                }
            }
        });
    }

    const profListBody = document.getElementById('prof-table-body-list');
    if (profListBody) {
        profListBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-excluir-prof');
            if (btn) {
                const idProf = btn.getAttribute('data-id');
                if(confirm('Deseja remover este profissional do sistema?')) {
                    try {
                        await deleteDoc(doc(db, "profissionais", idProf));
                        showToast('Profissional removido.', 'success');
                        await carregarProfissionais(); 
                    } catch(error) {
                        showToast('Falha ao remover profissional.', 'error');
                    }
                }
            }
        });
    }

    // ==========================================
    // ABAS DO PRONTUÁRIO
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                document.getElementById(e.currentTarget.getAttribute('data-tab')).classList.add('active');
            });
        });
    }

    const btnImprimir = document.getElementById('btn-imprimir-receita');
    if (btnImprimir) {
        btnImprimir.addEventListener('click', () => {
            const textoReceita = document.getElementById('texto-receita').value;
            const tipoDoc = document.getElementById('tipo-documento-impressao').value;
            
            if(!textoReceita.trim()) return showToast('Digite o conteúdo do documento.', 'warning');

            const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacienteAtivoId));
            const profId = document.getElementById('pep-profissional').value;
            const profissional = clinicaState.profissionais.find(p => String(p.id) === String(profId));

            if (!profissional) return showToast('Selecione o Profissional Responsável.', 'error');

            document.getElementById('print-tipo-doc').textContent = tipoDoc;
            document.getElementById('print-nome-paciente').textContent = paciente.nome;
            document.getElementById('print-nasc-paciente').textContent = paciente.nascimento ? paciente.nascimento.split('-').reverse().join('/') : 'Não inf.';
            document.getElementById('print-cpf-paciente').textContent = paciente.cpf || 'Não inf.';
            document.getElementById('print-data').textContent = new Date().toLocaleDateString('pt-BR');
            document.getElementById('print-conteudo-receita').textContent = textoReceita;
            document.getElementById('print-medico-nome').textContent = profissional.nome;
            document.getElementById('print-medico-registro').textContent = `${profissional.conselho}: ${profissional.registro}`;

            window.print();
        });
    }

    // ==========================================
    // BUSCA DE PACIENTES
    // ==========================================
    const inputBusca = document.getElementById('search-paciente');
    const btnBuscar = document.getElementById('btn-buscar-paciente');

    function executarBusca() {
        if (!inputBusca) return;
        const termo = inputBusca.value.toLowerCase().trim();
        const termoApenasNumeros = termo.replace(/\D/g, ''); 
        
        if (termo === '') return atualizarTabelaPacientes(clinicaState.pacientes);

        const pacientesFiltrados = clinicaState.pacientes.filter(p => {
            const nome = p.nome ? p.nome.toLowerCase() : '';
            const cpfApenasNumeros = (p.cpf ? p.cpf : '').replace(/\D/g, '');
            return nome.includes(termo) || (termoApenasNumeros !== '' && cpfApenasNumeros.includes(termoApenasNumeros));
        });

        atualizarTabelaPacientes(pacientesFiltrados);
    }

    if (btnBuscar) btnBuscar.addEventListener('click', executarBusca);
    if (inputBusca) inputBusca.addEventListener('keyup', executarBusca);
}

export function abrirProntuario(idPaciente) {
    const paciente = clinicaState.pacientes.find(p => String(p.id) === String(idPaciente));
    
    if (paciente) {
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
        document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('pacientes').classList.add('active');
        document.querySelector('[data-target="pacientes"]').classList.add('active');
        
        pacienteAtivoId = paciente.id;
        
        const selProf = document.getElementById('pep-profissional');
        if (selProf) {
            let profsPermitidos = clinicaState.profissionais;
            let travaSelect = false;

            if (clinicaState.sessao.perfil === 'Doutor(a)') {
                profsPermitidos = clinicaState.profissionais.filter(p => p.nome.trim().toLowerCase() === clinicaState.sessao.nome.trim().toLowerCase());
                travaSelect = true;
            }

            selProf.innerHTML = '<option value="" disabled selected>Selecione para assinar...</option>' + 
                profsPermitidos.map(p => `<option value="${p.id}">${p.nome} (${p.conselho}: ${p.registro})</option>`).join('');
            
            if (travaSelect && profsPermitidos.length > 0) {
                selProf.value = profsPermitidos[0].id;
                selProf.style.pointerEvents = 'none'; 
                selProf.style.backgroundColor = '#e2e8f0'; 
            } else {
                selProf.style.pointerEvents = 'auto';
                selProf.style.backgroundColor = '';
            }
        }
        
        renderizarEvolucoes(paciente);
        renderizarResumoPacienteAtivo();
        
        const areaHistorico = document.querySelector('.pep-historico'); 
        const formEvolucao = document.querySelector('.pep-nova-evolucao'); 
        
        if (clinicaState.sessao.perfil !== 'Doutor(a)') {
            if(areaHistorico) areaHistorico.style.display = 'none';
            if(formEvolucao) formEvolucao.style.display = 'none';
        } else {
            if(areaHistorico) areaHistorico.style.display = 'block';
            if(formEvolucao) formEvolucao.style.display = 'block';
        }

        const listaContainer = document.getElementById('lista-pacientes-container');
        if (listaContainer) listaContainer.style.display = 'none';
        document.getElementById('prontuario-ativo').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function renderizarEvolucoes(paciente) {
    const container = document.getElementById('pep-timeline');
    const chaveSecreta = "GestaoPRO_" + clinicaState.sessao.clinicaId;
    
    container.innerHTML = paciente.evolucoes.slice().reverse().map(evo => {
        let textoDescriptografado = "";
        try {
            const bytes = CryptoJS.AES.decrypt(evo.texto, chaveSecreta);
            textoDescriptografado = bytes.toString(CryptoJS.enc.Utf8);
            if (!textoDescriptografado) textoDescriptografado = evo.texto;
        } catch (e) {
            textoDescriptografado = evo.texto; 
        }

        let textoFormatado = escapeHTML(textoDescriptografado)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
        return `
        <details class="timeline-item">
            <summary class="timeline-meta">
                <span><i class="fa-regular fa-calendar"></i> <strong>${evo.data}</strong></span>
                <span class="assinatura-meta"><i class="fa-solid fa-lock"></i> ${evo.assinatura}</span>
            </summary>
            <div class="timeline-content">${textoFormatado}</div>
        </details>
    `}).join('') || '<p>Sem registros anteriores.</p>';
}

export function renderizarResumoPacienteAtivo() {
    if (!pacienteAtivoId) return;
    const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacienteAtivoId));
    if (!paciente) return;
    
    const elNome = document.getElementById('pep-nome-paciente');
    const elDados = document.getElementById('pep-dados-basicos');
    const elConvenio = document.getElementById('pep-convenio');
    const elAlergias = document.getElementById('pep-alergias');

    if (elNome) elNome.textContent = paciente.nome;
    const dataNasc = paciente.nascimento ? paciente.nascimento.split('-').reverse().join('/') : 'Não inf.';
    if (elDados) elDados.textContent = `CPF: ${paciente.cpf} | Nasc: ${dataNasc} | Tel: ${paciente.telefone || 'Não inf.'}`;
    
    if (elConvenio) elConvenio.innerHTML = `<i class="fa-solid fa-address-card"></i> ${paciente.convenio || 'Particular'}`;
    
    if (elAlergias) {
        if (paciente.alergias) {
            elAlergias.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Alergias: ${paciente.alergias}`;
            elAlergias.className = 'pep-badge danger';
        } else {
            elAlergias.innerHTML = `<i class="fa-solid fa-check"></i> Sem alergias`;
            elAlergias.className = 'pep-badge neutral';
        }
    }
}

export function atualizarTabelaPacientes(lista = clinicaState.pacientes) {
    const patientListBody = document.getElementById('patient-table-body-list');
    if (patientListBody) {
        patientListBody.innerHTML = lista.map(p => 
            `<tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.cpf}</td>
                <td>${p.convenio}</td>
                <td style="color:red">${p.alergias || '-'}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-action btn-abrir-prontuario" data-id="${p.id}" title="Acessar Ficha">
                            <i class="fa-regular fa-folder-open"></i>
                        </button>
                        <button class="btn-action btn-edit btn-editar-paciente" data-id="${p.id}" title="Editar Dados">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-action btn-delete btn-excluir-paciente" data-id="${p.id}" title="Excluir Cadastro">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`
        ).join('');
    }
    renderizarResumoPacienteAtivo();
}

// ==========================================
// LEITURA DE DADOS COM DESCRIPTOGRAFIA
// ==========================================
export async function carregarPacientes() {
    try {
        const q = query(
            collection(db, "pacientes"),
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);

        const chaveSecreta = "GestaoPRO_" + clinicaState.sessao.clinicaId;
        
        const decriptar = (textoCripto) => {
            if (!textoCripto) return '';
            try {
                const bytes = CryptoJS.AES.decrypt(textoCripto, chaveSecreta);
                const original = bytes.toString(CryptoJS.enc.Utf8);
                return original || textoCripto; 
            } catch(e) {
                return textoCripto;
            }
        };

        clinicaState.pacientes = [];
        querySnapshot.forEach((doc) => {
            const d = doc.data();
            clinicaState.pacientes.push({
                ...d,
                id: String(doc.id),
                nome: decriptar(d.nome),
                cpf: decriptar(d.cpf),
                rg: decriptar(d.rg),
                nascimento: decriptar(d.nascimento),
                mae: decriptar(d.mae),
                telefone: decriptar(d.telefone),
                email: decriptar(d.email),
                sangue: decriptar(d.sangue),
                alergias: decriptar(d.alergias),
                convenio: decriptar(d.convenio),
                carteirinha: decriptar(d.carteirinha),
                emergencia: decriptar(d.emergencia),
                responsavel: decriptar(d.responsavel)
            });
        });

        atualizarTabelaPacientes();
    } catch (error) {
        showToast('Erro ao carregar lista de pacientes.', 'error');
    }
}

export async function carregarProfissionais() {
    try {
        const q = query(
            collection(db, "profissionais"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        const chaveSecreta = "GestaoPRO_" + clinicaState.sessao.clinicaId;
        
        const decriptar = (textoCripto) => {
            if (!textoCripto) return '';
            try {
                const bytes = CryptoJS.AES.decrypt(textoCripto, chaveSecreta);
                const original = bytes.toString(CryptoJS.enc.Utf8);
                return original || textoCripto;
            } catch(e) {
                return textoCripto;
            }
        };

        clinicaState.profissionais = [];
        querySnapshot.forEach((doc) => {
            const d = doc.data();
            clinicaState.profissionais.push({
                ...d,
                id: String(doc.id),
                nome: decriptar(d.nome),
                cpf: decriptar(d.cpf),
                rg: decriptar(d.rg),
                nascimento: decriptar(d.nascimento),
                mae: decriptar(d.mae),
                telefone: decriptar(d.telefone),
                email: decriptar(d.email),
                conselho: decriptar(d.conselho),
                registro: decriptar(d.registro),
                especialidade: decriptar(d.especialidade),
                rqe: decriptar(d.rqe),
                vinculo: decriptar(d.vinculo)
            });
        });
        
        atualizarTabelaProfissionais();
    } catch (error) {
        showToast('Erro ao carregar lista de profissionais.', 'error');
    }
}

export function atualizarTabelaProfissionais() {
    const profListBody = document.getElementById('prof-table-body-list');
    if (profListBody) {
        profListBody.innerHTML = clinicaState.profissionais.map(p => 
            `<tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.especialidade}</td>
                <td>${p.conselho} ${p.registro}</td>
                <td>
                    <button class="btn-action btn-delete btn-excluir-prof" data-id="${p.id}">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                </td>
            </tr>`
        ).join('');
    }
}