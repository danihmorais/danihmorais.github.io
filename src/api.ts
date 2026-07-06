const BASE_URL = import.meta.env.VITE_API_URL || 'https://danihmorais-github-io.onrender.com/api';

export const gerarEdital = async (dados: any) => {
    const response = await fetch(`${BASE_URL}/gerar-edital`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(dados)
    });

    if (!response.ok) {
        throw new Error('Failed to fetch');
    }

    return await response.json();
};