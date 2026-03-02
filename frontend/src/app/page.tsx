import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-900 to-primary-700">
      <div className="text-center text-white max-w-2xl px-4">
        <h1 className="text-5xl font-bold mb-4">ProctoLearn</h1>
        <p className="text-xl text-primary-200 mb-8">
          Прокторингтік технологиямен онлайн оқытудың заманауи платформасы
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/auth/login"
            className="bg-white text-primary-700 font-semibold px-8 py-3 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Жүйеге кіру
          </Link>
          <Link
            href="/auth/register"
            className="border-2 border-white text-white font-semibold px-8 py-3 rounded-xl hover:bg-white/10 transition-colors"
          >
            Тіркелу
          </Link>
        </div>
        <p className="mt-12 text-primary-300 text-sm">
          Нақты уақыттағы прокторинг · Trust Score жүйесі · Автоматты сертификаттар
        </p>
      </div>
    </main>
  );
}
