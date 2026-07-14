import { clinicaState } from './state.js';
import { showToast, escapeHTML } from './Ferramentas.js';
import { atualizarAgenda } from './agenda.js';

import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from './firebase.js';

let pacienteAtivoId = null;
let pacienteEmEdicaoId = null; // Variável nova! Indica quem estamos editando

export function initPacientes() {
    const modalCadastro = document.getElementById('modal-cadastro');
    const tipoCadastro = document.getElementById('tipo-cadastro');
    
    document.getElementById('btn-novo-paciente').addEventListener('click', () => abrirModalCadastro('paciente'));
    document.getElementById('btn-novo-profissional').addEventListener('click', () => abrirModalCadastro('profissional'));
    document.getElementById('btn-close-cadastro').addEventListener('click', () => { modalCadastro.classList.remove('active');
        pacienteEmEdicaoId = null; // Garante que a chave desliga se cancelar a ação
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

    document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const tipo = tipoCadastro.value;

        // --- TRAVA DE SEGURANÇA PARA PROFISSIONAIS ---
        if (tipo === 'profissional') {
            const conselho = document.getElementById('cad-conselho').value.trim();
            const registro = document.getElementById('cad-num-registro').value.trim();
            if (!conselho || !registro) {
                showToast('O Conselho (ex: CRM) e o Registro são obrigatórios por lei!', 'warning');
                return; // Interrompe a função e não salva
            }
        }
        // ---------------------------------------------

        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        
        // Feedback visual enquanto salva na nuvem
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando na nuvem...';
        btnSalvar.disabled = true;

        const baseData = {
            nome: document.getElementById('cad-nome').value,
            cpf: document.getElementById('cad-cpf').value,
            rg: document.getElementById('cad-rg').value,
            nascimento: document.getElementById('cad-nascimento').value,
            mae: document.getElementById('cad-mae').value,
            telefone: document.getElementById('cad-tel').value,
            email: document.getElementById('cad-email').value,
            dataCadastro: new Date().toISOString(),
            // CARIMBO DE SEGURANÇA:
            clinicaId: clinicaState.sessao.clinicaId 
        };

        try {
            if (tipo === 'paciente') {
                const dadosParaSalvar = {
                    ...baseData,
                    sangue: document.getElementById('cad-sangue').value,
                    alergias: document.getElementById('cad-alergias').value,
                    convenio: document.getElementById('cad-convenio').value || 'Particular',
                    carteirinha: document.getElementById('cad-carteirinha').value,
                    emergencia: document.getElementById('cad-emergencia').value,
                    responsavel: document.getElementById('cad-responsavel').value
                };

                if (pacienteEmEdicaoId) {
                    // Modo Edição (Atualiza na nuvem)
                    await updateDoc(doc(db, "pacientes", pacienteEmEdicaoId), dadosParaSalvar);
                    showToast('Dados do paciente atualizados!', 'success');
                } else {
                    // Modo Novo Cadastro (Cria na nuvem mantendo as evoluções vazias no início)
                    dadosParaSalvar.evolucoes = [];
                    await addDoc(collection(db, "pacientes"), dadosParaSalvar);
                    showToast('Paciente salvo no banco de dados!', 'success');
                }
            } else {
                // (Mantenha o código original de profissionais aqui)
                await addDoc(collection(db, "profissionais"), {
                    ...baseData,
                    conselho: document.getElementById('cad-conselho').value,
                    registro: document.getElementById('cad-num-registro').value,
                    especialidade: document.getElementById('cad-especialidade').value,
                    rqe: document.getElementById('cad-rqe').value,
                    vinculo: document.getElementById('cad-vinculo').value
                });
                showToast('Profissional salvo no banco de dados!', 'success');
            }

            modalCadastro.classList.remove('active');
            e.target.reset();
            pacienteEmEdicaoId = null; // Desliga a chave de edição ao terminar!
            
            await carregarPacientes(); 
            await carregarProfissionais();

        } catch (error) {
            console.error("Erro ao salvar no Firestore: ", error);
            showToast('Erro de conexão ao salvar os dados.', 'error');
        } finally {
            // Restaura o botão
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });

    // Eventos do PEP
    document.getElementById('btn-buscar-paciente').addEventListener('click', () => {
        const query = document.getElementById('search-paciente').value.toLowerCase();
        const paciente = clinicaState.pacientes.find(p => p.nome.toLowerCase().includes(query) || p.cpf === query);
        if (paciente) {
            abrirProntuario(paciente.id);
            showToast('Prontuário encontrado.', 'success');
        } else {
            showToast('Paciente não localizado.', 'error');
        }
    });

    document.getElementById('btn-fechar-pep').addEventListener('click', () => {
        document.getElementById('prontuario-ativo').style.display = 'none';

        const listaContainer = document.getElementById('lista-pacientes-container');
        if (listaContainer) listaContainer.style.display = 'block';

        pacienteAtivoId = null;
        renderizarResumoPacienteAtivo();
    });

    document.getElementById('form-evolucao').addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!pacienteAtivoId) return;
        
        // Pega o paciente garantindo que o ID é string
        const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacienteAtivoId));
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Assinando...';
        btnSalvar.disabled = true;

        const texto = `**Anamnese:** ${document.getElementById('pep-anamnese').value}
    **Exame Físico:** ${document.getElementById('pep-exame-fisico').value}
    **Diagnóstico:** ${document.getElementById('pep-diagnostico').value || 'N/A'}
    **Prescrição:** ${document.getElementById('pep-prescricao').value}`.trim();

        // Descobre quem é o médico que está salvando a evolução
        const profId = document.getElementById('pep-profissional').value;
        const profissional = clinicaState.profissionais.find(p => String(p.id) === String(profId));
        
        if (!profissional) {
            showToast('Selecione um profissional para assinar a ficha.', 'warning');
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
            return;
        }

        const novaEvolucao = {
            data: new Date().toLocaleString('pt-BR'),
            texto: texto,
            assinatura: `Assinado digitalmente por ${profissional.nome} | ${profissional.conselho}: ${profissional.registro}`
        };

        // Garante que o array existe antes de dar o push
        if (!paciente.evolucoes) paciente.evolucoes = [];
        paciente.evolucoes.push(novaEvolucao);

        try {
            // Atualiza apenas o campo de evoluções desse paciente específico na nuvem
            const pacienteRef = doc(db, "pacientes", paciente.id);
            await updateDoc(pacienteRef, {
                evolucoes: paciente.evolucoes
            });

            renderizarEvolucoes(paciente);
            e.target.reset();
            showToast('Evolução salva no Prontuário com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar evolução: ", error);
            showToast('Erro de conexão ao salvar ficha.', 'error');
            // Reverte a ação na tela se a internet falhar
            paciente.evolucoes.pop(); 
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });

    // Delegação de eventos para abrir o PEP a partir da tabela
    // Delegação de eventos da tabela de pacientes (Abrir, Editar, Excluir)
    const patientListBody = document.getElementById('patient-table-body-list');
    if (patientListBody) {
        patientListBody.addEventListener('click', async (e) => {
            const btnAbrir = e.target.closest('.btn-abrir-prontuario');
            const btnEditar = e.target.closest('.btn-editar-paciente');
            const btnExcluir = e.target.closest('.btn-excluir-paciente');

            if (btnAbrir) {
                abrirProntuario(btnAbrir.getAttribute('data-id'));
            }

            if (btnExcluir) {
                const idPac = btnExcluir.getAttribute('data-id');
                if (confirm('Atenção: Deseja realmente excluir permanentemente este paciente e todo o seu prontuário?')) {
                    try {
                        await deleteDoc(doc(db, "pacientes", idPac));
                        showToast('Paciente excluído do sistema.', 'success');
                        await carregarPacientes();
                    } catch (error) {
                        console.error("Erro ao excluir: ", error);
                        showToast('Falha ao excluir paciente.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const idPac = btnEditar.getAttribute('data-id');
                const paciente = clinicaState.pacientes.find(p => String(p.id) === String(idPac));
                
                if (paciente) {
                    pacienteEmEdicaoId = paciente.id; // Liga a chave de edição
                    
                    // Preenche os campos do formulário magicamente
                    document.getElementById('tipo-cadastro').value = 'paciente';
                    abrirModalCadastro('paciente'); 
                    
                    // Pula a etapa de verificação de CPF
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

    // Evento para excluir profissional
    const profListBody = document.getElementById('prof-table-body-list');
    if (profListBody) {
        profListBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-excluir-prof');
            if (btn) {
                const idProfissional = btn.getAttribute('data-id');
                
                // Pede confirmação antes de apagar dados do banco
                if(confirm('Tem certeza que deseja inativar/remover este profissional do sistema?')) {
                    try {
                        await deleteDoc(doc(db, "profissionais", idProfissional));
                        showToast('Profissional removido com sucesso.', 'success');
                        await carregarProfissionais(); // Recarrega a tabela sem o excluído
                    } catch(error) {
                        console.error("Erro ao excluir", error);
                        showToast('Falha ao remover profissional.', 'error');
                    }
                }
            }
        });
    }

    // === MOTOR DE BUSCA DE PACIENTES ===
    const inputBusca = document.getElementById('search-paciente');
    const btnBuscar = document.getElementById('btn-buscar-paciente');

    function executarBusca() {
        if (!inputBusca) return;
        
        const termo = inputBusca.value.toLowerCase().trim();
        
        // Se o campo estiver vazio, mostra todo mundo
        if (termo === '') {
            atualizarTabelaPacientes(clinicaState.pacientes);
            return;
        }

        // Filtra a lista comparando o termo com o Nome ou o CPF
        const pacientesFiltrados = clinicaState.pacientes.filter(p => {
            const nome = p.nome ? p.nome.toLowerCase() : '';
            const cpf = p.cpf ? p.cpf : '';
            return nome.includes(termo) || cpf.includes(termo);
        });

        // Atualiza a tabela apenas com quem passou no filtro
        atualizarTabelaPacientes(pacientesFiltrados);
    }

    // Dispara a busca ao clicar no botão
    if (btnBuscar) {
        btnBuscar.addEventListener('click', executarBusca);
    }

    // Dispara a busca em tempo real enquanto o usuário digita
    if (inputBusca) {
        inputBusca.addEventListener('keyup', executarBusca);
    }

}

export function abrirProntuario(idPaciente) {
    const paciente = clinicaState.pacientes.find(p => String(p.id) === String(idPaciente));
    
    if (paciente) {
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
        document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('pacientes').classList.add('active');
        document.querySelector('[data-target="pacientes"]').classList.add('active');
        
        pacienteAtivoId = paciente.id;

        // Preenche a lista de profissionais para assinatura
        const selProf = document.getElementById('pep-profissional');
        if (selProf) {
            selProf.innerHTML = '<option value="" disabled selected>Selecione para assinar...</option>' + 
                clinicaState.profissionais.map(p => `<option value="${p.id}">${p.nome} (${p.conselho}: ${p.registro})</option>`).join('');
        }
        
        renderizarEvolucoes(paciente);
        renderizarResumoPacienteAtivo(); 
        
        // === TRAVA VISUAL LGPD ===
        // Oculta a área de histórico e digitação para quem não for médico
        const areaHistorico = document.querySelector('.pep-historico'); // Área onde lista as evoluções
        const formEvolucao = document.querySelector('.pep-nova-evolucao'); // Área de digitar evolução
        
        if (clinicaState.sessao.perfil !== 'Doutor(a)') {
            if(areaHistorico) areaHistorico.style.display = 'none';
            if(formEvolucao) formEvolucao.style.display = 'none';
        } else {
            if(areaHistorico) areaHistorico.style.display = 'block';
            if(formEvolucao) formEvolucao.style.display = 'block';
        }
        // =========================

        const listaContainer = document.getElementById('lista-pacientes-container');
        if (listaContainer) listaContainer.style.display = 'none';

        document.getElementById('prontuario-ativo').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function renderizarEvolucoes(paciente) {
    const container = document.getElementById('pep-timeline');
    
    container.innerHTML = paciente.evolucoes.slice().reverse().map(evo => {
        // Mágica Front-end: Troca os **texto** por <strong>texto</strong>
        let textoFormatado = escapeHTML(evo.texto)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
        return `
        <div class="timeline-item">
            <div class="timeline-meta">
                <span><i class="fa-regular fa-calendar"></i> ${evo.data}</span>
                <span style="color:#198754"><i class="fa-solid fa-lock"></i> ${evo.assinatura}</span>
            </div>
            <div class="timeline-content">${textoFormatado}</div>
        </div>
    `}).join('') || '<p>Sem registros anteriores.</p>';
}

export function renderizarResumoPacienteAtivo() {
    if (!pacienteAtivoId) return;
    
    const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacienteAtivoId));
    if (!paciente) return;
    
    // Preenche o novo Cabeçalho Premium
    const elNome = document.getElementById('pep-nome-paciente');
    const elDados = document.getElementById('pep-dados-basicos');
    const elConvenio = document.getElementById('pep-convenio');
    const elAlergias = document.getElementById('pep-alergias');

    if (elNome) elNome.textContent = paciente.nome;
    
    // Formata os dados básicos
    const dataNasc = paciente.nascimento ? paciente.nascimento.split('-').reverse().join('/') : 'Não inf.';
    if (elDados) elDados.textContent = `CPF: ${paciente.cpf} | Nasc: ${dataNasc} | Tel: ${paciente.telefone || 'Não inf.'}`;
    
    // Adiciona ícones e cores nas badges
    if (elConvenio) {
        elConvenio.innerHTML = `<i class="fa-solid fa-address-card"></i> ${paciente.convenio || 'Particular'}`;
    }
    
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
        // AQUI ESTÁ A MÁGICA: Trocamos 'clinicaState.pacientes.map' por 'lista.map'
        patientListBody.innerHTML = lista.map(p => 
            `<tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.cpf}</td>
                <td>${p.convenio}</td>
                <td style="color:red">${p.alergias || '-'}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-action btn-abrir-prontuario" data-id="${p.id}" title="Acessar Ficha">
                            <i class="fa-regular fa-folder-open"></i>
                        </button>
                        <button class="btn-action btn-editar-paciente" data-id="${p.id}" style="color: var(--primary-light); border-color: var(--primary-light);" title="Editar Dados">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-action btn-excluir-paciente" data-id="${p.id}" style="color: #dc3545; border-color: #dc3545;" title="Excluir Cadastro">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`
        ).join('');
    }
    renderizarResumoPacienteAtivo();
}


export async function carregarPacientes() {
    try {
        // O Raio-X: Mostra no console qual clínica ele está usando como filtro
        console.log("🔍 Buscando pacientes para a clínica:", clinicaState.sessao.clinicaId);

        const q = query(
            collection(db, "pacientes"),
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);

        // Mostra no console quantos pacientes ele conseguiu achar lá no Firebase
        console.log(`📦 Encontrados: ${querySnapshot.size} pacientes no banco.`);

        clinicaState.pacientes = [];
        querySnapshot.forEach((doc) => {
            clinicaState.pacientes.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });

        atualizarTabelaPacientes();

    } catch (error) {
        console.error("❌ Erro grave ao buscar pacientes: ", error);
        showToast('Erro ao carregar lista de pacientes.', 'error');
    }
}

export async function carregarProfissionais() {
    try {
        console.log("🔍 Buscando profissionais para a clínica:", clinicaState.sessao.clinicaId);
        
        const q = query(
            collection(db, "profissionais"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        clinicaState.profissionais = [];
        querySnapshot.forEach((doc) => {
            clinicaState.profissionais.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });
        
        atualizarTabelaProfissionais();
    } catch (error) {
        console.error("❌ Erro ao buscar profissionais: ", error);
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
                    <button class="btn-action btn-excluir-prof" data-id="${p.id}" style="color: #dc3545; border-color: #dc3545;">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                </td>
            </tr>`
        ).join('');
    }
}